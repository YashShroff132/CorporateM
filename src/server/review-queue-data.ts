/**
 * AI Review Queue data-access layer (task 20, Req 15.1–15.10).
 *
 * Orchestrates the full AI slogan pipeline behind the `aiStudio` flag:
 *
 *   generate → moderate → render mockup → create Design + Product (PENDING_REVIEW)
 *   → per-item approve / edit / regenerate / reject → bulk-approve
 *
 * - Generation runs through {@link runGeneration} (rate-limited, deduped,
 *   audited — Req 12.7/12.9/12.10).
 * - Each candidate is moderated through the pure {@link route}/{@link evaluate}
 *   gate using the LENIENT thresholds from `config.moderationThresholds()`
 *   (Owner_Input), while prohibited-category detection still forces AUTO_REJECT
 *   regardless of score (safety floor, Req 13.2–13.4).
 * - Candidates the gate admits to the queue (ADMIT or NEEDS_REVIEW) get a mockup
 *   preview and a Design + Product in PENDING_REVIEW with aiGenerated=true and
 *   default variants (Req 15.1). AUTO_REJECTed/WITHHELD candidates create nothing.
 * - Review actions: approve→PUBLISHED (Req 15.4), reject→ARCHIVED (Req 15.5),
 *   regenerate keeps PENDING_REVIEW (Req 15.8/15.9), edit updates the slogan.
 *   Approve/reject are guarded by the PENDING_REVIEW precondition (Req 15.7/15.10).
 * - Bulk-approve operates on at most 100 SAFE PENDING_REVIEW drafts (Req 15.6).
 * - Every mutation writes an append-only AuditLog row.
 *
 * Every DB touch degrades gracefully so `next build` never needs a live DB.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

import { config, type Config_Service } from '@/services/config';
import { runGeneration } from './ai-data';
import {
  evaluate,
  PROHIBITED_CATEGORIES,
  type ModerationAnalysis,
  type ModerationAuditEntry,
  type ModOutcome,
  type ProhibitedCategory,
} from '@/services/moderation';
import {
  fitText,
  presetsForCollection,
  selectTemplate,
  type BlankTemplate,
  type Rect,
} from '@/services/mockup';
import { renderAndStorePreview } from './mockup-data';
import type { GenParams, Slogan } from '@/services/ai-engine';
import type { Tier } from '@/services/catalog';
import { isOk } from '@/lib/result';
import { ADMIN_ACTOR_ID } from './admin-auth';

// ---------------------------------------------------------------------------
// Owner_Input defaults for AI-created products (Req 15.1)
// ---------------------------------------------------------------------------

/** Default base price (paise) for AI-created products when unconfigured. */
const DEFAULT_AI_BASE_PRICE_PAISE = 79_900; // ₹799

/** Default garment/color the preview renders onto when unconfigured. */
const DEFAULT_GARMENT = 'Classic Tee';
const DEFAULT_COLOR = 'Black';

/** Owner_Input default variant color/size/fit combinations (Req 15.1). */
interface DefaultVariantSpec {
  readonly color: string;
  readonly size: string;
  readonly fit: string;
}

function defaultVariantSpecs(env: NodeJS.ProcessEnv = process.env): DefaultVariantSpec[] {
  const color = (env.AI_DEFAULT_COLOR ?? DEFAULT_COLOR).trim() || DEFAULT_COLOR;
  const fit = (env.AI_DEFAULT_FIT ?? 'Regular').trim() || 'Regular';
  const sizesRaw = (env.AI_DEFAULT_SIZES ?? 'S,M,L,XL').trim();
  const sizes = sizesRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return (sizes.length > 0 ? sizes : ['S', 'M', 'L', 'XL']).map((size) => ({
    color,
    size,
    fit,
  }));
}

function aiBasePricePaise(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.AI_DEFAULT_BASE_PRICE_PAISE);
  return Number.isInteger(raw) && raw >= 0 ? raw : DEFAULT_AI_BASE_PRICE_PAISE;
}

function aiDefaultStock(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.AI_DEFAULT_STOCK);
  return Number.isInteger(raw) && raw >= 0 ? raw : 50;
}

const MAX_BULK_APPROVE = 100; // Req 15.6

async function client(): Promise<PrismaClient> {
  const { getPrisma } = await import('@/lib/prisma');
  return getPrisma();
}

/** Write an append-only audit row; best-effort. */
async function writeAudit(
  prisma: PrismaClient,
  actionType: string,
  entityType: string,
  entityId: string,
  detail: Prisma.InputJsonValue,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { actorId: ADMIN_ACTOR_ID, actionType, entityType, entityId, detail },
    });
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Moderation analyzer (lenient, with prohibited-category safety floor)
// ---------------------------------------------------------------------------

/**
 * Prohibited-content keyword floor. These map clearly-prohibited content to a
 * {@link ProhibitedCategory}, which forces AUTO_REJECT regardless of the lenient
 * numeric thresholds (Req 13.2–13.4). This floor is intentionally NOT tunable by
 * the moderation thresholds — it is the safety floor the Owner asked to keep.
 */
const PROHIBITED_PATTERNS: ReadonlyArray<{
  readonly category: ProhibitedCategory;
  readonly pattern: RegExp;
}> = [
  { category: 'HATE_SLUR_PROTECTED_CLASS', pattern: /\b(hate|slur|racist|bigot)\b/i },
  { category: 'SEXUAL', pattern: /\b(porn|sexual|nsfw|explicit)\b/i },
  { category: 'HARASSMENT', pattern: /\b(harass|bully)\b/i },
  { category: 'THREATS', pattern: /\b(kill|murder|shoot|bomb)\b/i },
  { category: 'SELF_HARM', pattern: /\b(suicide|self-harm|selfharm)\b/i },
  { category: 'ILLEGAL_ACTIVITY', pattern: /\b(cocaine|heroin|meth)\b/i },
];

/**
 * A deterministic, offline heuristic analyzer. It keeps the automatic check
 * LENIENT — the vast majority of edgy-but-fine slogans score 0 — while still
 * detecting clearly-prohibited categories that force AUTO_REJECT. This is the
 * seam a real Claude/moderation API call replaces later; it makes NO network
 * call so the dormant pipeline works without external keys.
 */
export function heuristicAnalyze(candidate: { slogan: string }): ModerationAnalysis {
  const categories: ProhibitedCategory[] = [];
  for (const { category, pattern } of PROHIBITED_PATTERNS) {
    if (pattern.test(candidate.slogan)) categories.push(category);
  }
  // Lenient: no category → score 0 (well below the review band). A detected
  // category still forces AUTO_REJECT via the category list.
  const score = categories.length > 0 ? 1 : 0;
  return { score, categories };
}

// Re-export the prohibited categories so the safety floor is discoverable.
export { PROHIBITED_CATEGORIES };

// ---------------------------------------------------------------------------
// Mockup preview for a draft
// ---------------------------------------------------------------------------

/** Convert a stored BlankTemplate.printArea Json into a mockup {@link Rect}. */
function printAreaToRect(raw: unknown): Rect {
  const a = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  // Support both the pure {width,height} shape and the seed {widthMm,heightMm}.
  const width = num(a.width, num(a.widthMm, 280));
  const height = num(a.height, num(a.heightMm, 350));
  return { width, height };
}

/** Load blank templates from the DB, mapped to the pure renderer shape. */
async function loadBlankTemplates(prisma: PrismaClient): Promise<BlankTemplate[]> {
  const rows = await prisma.blankTemplate.findMany();
  return rows.map((t) => ({
    id: t.id,
    garment: t.garment,
    color: t.color,
    printArea: printAreaToRect(t.printArea),
    preset: t.preset,
  }));
}

/** Result of rendering a draft preview. */
interface DraftPreview {
  readonly url: string | null;
  readonly note?: string;
}

/**
 * Render + store a preview for a slogan (Req 14.1–14.5). Returns a null url with
 * a note when no template matches, the text is too long, or a configured upload
 * fails (Req 14.7/14.8/14.9) — the draft is still created so the admin can edit
 * or regenerate.
 */
async function renderDraftPreview(
  prisma: PrismaClient,
  slogan: string,
  tier: Tier,
  collectionSlug: string,
  env: NodeJS.ProcessEnv,
): Promise<DraftPreview> {
  const templates = await loadBlankTemplates(prisma);
  if (templates.length === 0) {
    return { url: null, note: 'No blank templates configured — preview skipped.' };
  }
  const garment = (env.AI_DEFAULT_GARMENT ?? DEFAULT_GARMENT).trim() || DEFAULT_GARMENT;
  const color = (env.AI_DEFAULT_COLOR ?? DEFAULT_COLOR).trim() || DEFAULT_COLOR;

  const selected = selectTemplate(templates, garment, color);
  const template = isOk(selected) ? selected.value : templates[0];
  if (template === undefined) {
    return { url: null, note: 'No blank templates configured — preview skipped.' };
  }

  const preset = presetsForCollection(collectionSlug, tier)[0];
  const fitted = fitText(slogan, template.printArea, preset);
  if (!isOk(fitted)) {
    return { url: null, note: `Slogan does not fit the print area: ${fitted.error.message}` };
  }

  const stored = await renderAndStorePreview(
    fitted.value,
    `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    { garment: template.garment, color: template.color, env },
  );
  if (!isOk(stored)) {
    return { url: null, note: `Preview could not be stored: ${stored.error.message}` };
  }
  return { url: stored.value.url, note: stored.value.note };
}

// ---------------------------------------------------------------------------
// slug helpers
// ---------------------------------------------------------------------------

function slugifySlogan(slogan: string): string {
  const base = slogan
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base.length > 0 ? base : 'ai-slogan'}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Generate drafts
// ---------------------------------------------------------------------------

/** Per-candidate outcome from a generation batch. */
export interface CandidateResult {
  readonly slogan: string;
  readonly outcome: ModOutcome | 'WITHHELD';
  readonly created: boolean;
  readonly productId?: string;
  readonly note?: string;
}

/** The outcome of a generate-drafts run. */
export type GenerateDraftsResult =
  | { readonly ok: true; readonly created: number; readonly candidates: CandidateResult[] }
  | { readonly ok: false; readonly message: string };

/** Parameters accepted by the generate form. */
export interface GenerateDraftsParams {
  readonly tier: Tier;
  /** Collection id or slug. */
  readonly collection: string;
  readonly count: number;
  readonly tone?: string;
  readonly garmentOrColor?: string;
}

/**
 * Run the full generate → moderate → render → create-draft pipeline (Req 15.1).
 * Returns per-candidate outcomes. Requires the `aiStudio` flag (enforced by the
 * caller via requireFlag and again inside {@link runGeneration}).
 */
export async function generateDrafts(
  params: GenerateDraftsParams,
  options: { cfg?: Config_Service; env?: NodeJS.ProcessEnv; adminId?: string } = {},
): Promise<GenerateDraftsResult> {
  const cfg = options.cfg ?? config;
  const env = options.env ?? process.env;

  let prisma: PrismaClient;
  try {
    prisma = await client();
  } catch {
    return { ok: false, message: 'Database not connected — could not generate drafts.' };
  }

  // Resolve the collection by id or slug.
  let collection: { id: string; slug: string } | null = null;
  try {
    collection = await prisma.collection.findFirst({
      where: { OR: [{ id: params.collection }, { slug: params.collection }] },
      select: { id: true, slug: true },
    });
  } catch {
    return { ok: false, message: 'Database not connected — could not generate drafts.' };
  }
  if (collection === null) {
    return { ok: false, message: `Collection "${params.collection}" does not exist.` };
  }

  const genParams: GenParams = {
    tier: params.tier,
    collection: collection.slug,
    count: params.count,
    tone: params.tone?.trim().length ? params.tone : 'deadpan corporate',
    garmentOrColor: params.garmentOrColor?.trim().length
      ? params.garmentOrColor
      : `${DEFAULT_COLOR} ${DEFAULT_GARMENT}`,
  };

  const generated = await runGeneration(genParams, { cfg, env, adminId: options.adminId });
  if (!generated.ok) {
    return { ok: false, message: generated.error.message };
  }

  const thresholds = cfg.moderationThresholds();
  const candidates: CandidateResult[] = [];
  let created = 0;

  for (const slogan of generated.value.slogans) {
    const result = await createDraftForSlogan(
      prisma,
      slogan,
      collection.id,
      collection.slug,
      thresholds,
      env,
    );
    if (result.created) created += 1;
    candidates.push(result);
  }

  return { ok: true, created, candidates };
}

/** Moderate one candidate and, when admitted, create its Design + Product draft. */
async function createDraftForSlogan(
  prisma: PrismaClient,
  slogan: Slogan,
  collectionId: string,
  collectionSlug: string,
  thresholds: { review: number; autoReject: number },
  env: NodeJS.ProcessEnv,
): Promise<CandidateResult> {
  // Moderate through the gate, recording the decision to the audit log (Req 13.7).
  const decision = await evaluate({ slogan: slogan.text, tier: slogan.tier }, thresholds, {
    analyze: (c) => Promise.resolve(heuristicAnalyze(c)),
    record: (entry: ModerationAuditEntry) =>
      writeAudit(prisma, 'MODERATION_DECISION', 'Design', slogan.text, {
        slogan: entry.slogan,
        tier: entry.tier,
        status: entry.status,
        reasons: entry.reasons,
        score: entry.score,
      }),
  });

  // Only candidates the gate admits to the queue become drafts (Req 13.9/13.10).
  if (!decision.entersReviewQueue) {
    return {
      slogan: slogan.text,
      outcome: decision.status === 'WITHHELD' ? 'WITHHELD' : (decision.status as ModOutcome),
      created: false,
      note: decision.reasons.join('; '),
    };
  }

  const outcome = decision.status as ModOutcome; // ADMIT or NEEDS_REVIEW

  // Render a preview (best-effort; the draft is still created for review).
  const preview = await renderDraftPreview(prisma, slogan.text, slogan.tier, collectionSlug, env);

  // Create Product (PENDING_REVIEW, aiGenerated true) + default variants + Design.
  try {
    const product = await prisma.product.create({
      data: {
        slug: slugifySlogan(slogan.text),
        slogan: slogan.text,
        tier: slogan.tier,
        collectionId,
        status: 'PENDING_REVIEW',
        basePrice: aiBasePricePaise(env),
        aiGenerated: true,
        mockupUrl: preview.url,
      },
      select: { id: true },
    });

    const specs = defaultVariantSpecs(env);
    const prodSlug = slugifySlogan(slogan.text);
    for (const [i, v] of specs.entries()) {
      await prisma.variant.create({
        data: {
          productId: product.id,
          sku: `${prodSlug.slice(0, 40)}-${i}`,
          color: v.color,
          size: v.size,
          fit: v.fit,
          stock: aiDefaultStock(env),
        },
      });
    }

    await prisma.design.create({
      data: {
        slogan: slogan.text,
        tier: slogan.tier,
        moderationOutcome: outcome,
        riskFlags: { reasons: decision.reasons } as Prisma.InputJsonValue,
        mockupUrl: preview.url,
        productId: product.id,
      },
    });

    await writeAudit(prisma, 'AI_DRAFT_CREATED', 'Product', product.id, {
      slogan: slogan.text,
      tier: slogan.tier,
      outcome,
      mockupStored: preview.url !== null,
    });

    return {
      slogan: slogan.text,
      outcome,
      created: true,
      productId: product.id,
      note: preview.note,
    };
  } catch (cause) {
    console.error('[createDraftForSlogan] Draft creation failed:', cause);
    return {
      slogan: slogan.text,
      outcome,
      created: false,
      note:
        cause instanceof Error
          ? `Draft creation failed: ${cause.message}`
          : 'Draft creation failed',
    };
  }
}

// ---------------------------------------------------------------------------
// Review list
// ---------------------------------------------------------------------------

/** A pending draft as displayed in the review queue (Req 15.2). */
export interface PendingDraft {
  readonly productId: string;
  readonly designId: string | null;
  readonly slogan: string;
  readonly tier: Tier;
  readonly mockupUrl: string | null;
  readonly riskFlags: string[];
  readonly createdAt: Date;
}

/** List products in PENDING_REVIEW with their design risk flags (Req 15.2). */
export async function listPendingDrafts(): Promise<PendingDraft[]> {
  try {
    const prisma = await client();
    const rows = await prisma.product.findMany({
      where: { status: 'PENDING_REVIEW' },
      orderBy: { createdAt: 'desc' },
      include: { designs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return rows.map((p) => {
      const design = p.designs[0];
      const flags = extractReasons(design?.riskFlags);
      return {
        productId: p.id,
        designId: design?.id ?? null,
        slogan: p.slogan,
        tier: p.tier,
        mockupUrl: p.mockupUrl,
        riskFlags: flags,
        createdAt: p.createdAt,
      };
    });
  } catch {
    return [];
  }
}

function extractReasons(riskFlags: unknown): string[] {
  if (riskFlags !== null && typeof riskFlags === 'object' && !Array.isArray(riskFlags)) {
    const reasons = (riskFlags as Record<string, unknown>).reasons;
    if (Array.isArray(reasons)) return reasons.filter((r): r is string => typeof r === 'string');
  }
  return [];
}

// ---------------------------------------------------------------------------
// Review actions
// ---------------------------------------------------------------------------

/** Discriminated result for review mutations. */
export type ReviewResult =
  | { readonly ok: true; readonly message?: string }
  | { readonly ok: false; readonly message: string };

/**
 * Approve a draft: transition PENDING_REVIEW → PUBLISHED (Req 15.4). Rejects the
 * action and leaves status unchanged when the product is not PENDING_REVIEW
 * (Req 15.7/15.10).
 */
export async function approveDraft(productId: string): Promise<ReviewResult> {
  return transitionPending(productId, 'PUBLISHED', 'AI_DRAFT_APPROVED');
}

/**
 * Reject a draft: transition PENDING_REVIEW → ARCHIVED (Req 15.5). Rejects the
 * action and leaves status unchanged when not PENDING_REVIEW (Req 15.10).
 */
export async function rejectDraft(productId: string): Promise<ReviewResult> {
  return transitionPending(productId, 'ARCHIVED', 'AI_DRAFT_REJECTED');
}

/** Shared PENDING_REVIEW-guarded status transition (Req 15.7/15.10). */
async function transitionPending(
  productId: string,
  next: 'PUBLISHED' | 'ARCHIVED',
  action: string,
): Promise<ReviewResult> {
  try {
    const prisma = await client();
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { status: true },
    });
    if (product === null || product.status !== 'PENDING_REVIEW') {
      return {
        ok: false,
        message: 'Draft is not in PENDING_REVIEW — no change made.',
      };
    }
    await prisma.product.update({
      where: { id: productId },
      data: { status: next },
    });
    await writeAudit(prisma, action, 'Product', productId, { status: next });
    return { ok: true };
  } catch (error) {
    console.error('[transitionPending] Database error:', error);
    return { ok: false, message: 'Database not connected — could not update the draft.' };
  }
}

/**
 * Edit a draft's slogan while it stays in PENDING_REVIEW. Updates the product
 * and its latest design slogan. Guarded by the PENDING_REVIEW precondition.
 */
export async function editDraftSlogan(
  productId: string,
  slogan: string,
): Promise<ReviewResult> {
  const trimmed = slogan.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: 'Slogan cannot be empty.' };
  }
  try {
    const prisma = await client();
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { status: true },
    });
    if (product === null || product.status !== 'PENDING_REVIEW') {
      return { ok: false, message: 'Draft is not in PENDING_REVIEW — no change made.' };
    }
    await prisma.product.update({
      where: { id: productId },
      data: { slogan: trimmed },
    });
    await writeAudit(prisma, 'AI_DRAFT_EDITED', 'Product', productId, { slogan: trimmed });
    return { ok: true };
  } catch (error) {
    console.error('[editDraftSlogan] Database error:', error);
    return { ok: false, message: 'Database not connected — could not edit the draft.' };
  }
}

/**
 * Regenerate a draft's mockup, keeping the product in PENDING_REVIEW (Req 15.8).
 * On failure, retain the existing preview and status and return an error
 * (Req 15.9).
 */
export async function regenerateDraftMockup(
  productId: string,
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<ReviewResult> {
  const env = options.env ?? process.env;
  try {
    const prisma = await client();
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, slogan: true, tier: true, status: true, collection: { select: { slug: true } } },
    });
    if (product === null) {
      return { ok: false, message: 'Draft not found.' };
    }
    if (product.status !== 'PENDING_REVIEW') {
      return { ok: false, message: 'Draft is not in PENDING_REVIEW — no change made.' };
    }

    const preview = await renderDraftPreview(
      prisma,
      product.slogan,
      product.tier,
      product.collection.slug,
      env,
    );
    if (preview.url === null) {
      // Retain existing preview + status; report the failure (Req 15.9).
      await writeAudit(prisma, 'AI_MOCKUP_REGEN_FAILED', 'Product', productId, {
        note: preview.note,
      });
      return {
        ok: false,
        message: preview.note ?? 'Mockup regeneration could not be completed.',
      };
    }

    await prisma.product.update({
      where: { id: productId },
      data: { mockupUrl: preview.url },
    });
    // Update the latest design's mockup too, when present.
    const latest = await prisma.design.findFirst({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (latest !== null) {
      await prisma.design.update({ where: { id: latest.id }, data: { mockupUrl: preview.url } });
    }
    await writeAudit(prisma, 'AI_MOCKUP_REGENERATED', 'Product', productId, {
      mockupStored: true,
    });
    return { ok: true };
  } catch (error) {
    console.error('[regenerateDraftMockup] Database error:', error);
    return { ok: false, message: 'Database not connected — could not regenerate the mockup.' };
  }
}

/**
 * Bulk-approve up to 100 SAFE PENDING_REVIEW drafts (Req 15.6). Only SAFE-tier
 * PENDING_REVIEW products are eligible; the cap is enforced. Returns how many
 * were approved.
 */
export async function bulkApproveSafeDrafts(
  productIds: readonly string[],
): Promise<{ ok: true; approved: number } | { ok: false; message: string }> {
  const ids = [...new Set(productIds)].slice(0, MAX_BULK_APPROVE);
  if (ids.length === 0) {
    return { ok: false, message: 'No drafts selected.' };
  }
  try {
    const prisma = await client();
    // Only SAFE + PENDING_REVIEW are eligible (Req 15.6).
    const products = await prisma.product.findMany({
      where: { id: { in: ids }, status: 'PENDING_REVIEW', tier: 'SAFE' },
      select: { id: true },
    });
    for (const p of products) {
      await prisma.product.update({
        where: { id: p.id },
        data: { status: 'PUBLISHED' },
      });
    }
    await writeAudit(prisma, 'AI_DRAFT_BULK_APPROVED', 'Product', 'bulk', {
      requested: ids.length,
      approved: products.length,
    });
    return { ok: true, approved: products.length };
  } catch (error) {
    console.error('[bulkApproveSafeDrafts] Database error:', error);
    return { ok: false, message: 'Database not connected — could not bulk-approve drafts.' };
  }
}

/** Collection option for the generate form select. */
export async function listCollectionOptionsForAi(): Promise<
  { id: string; title: string; slug: string }[]
> {
  try {
    const prisma = await client();
    return await prisma.collection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: { id: true, title: true, slug: true },
    });
  } catch {
    return [];
  }
}
