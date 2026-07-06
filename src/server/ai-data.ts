/**
 * AI server data-access layer (task 17.2, Req 12.7, 12.9, 12.10).
 *
 * Bridges the pure {@link AI_Engine} to persistence and cross-cutting policy:
 * - enforces the ≤10 generation-runs per admin per 60-minute rate limit
 *   (Req 12.10) through the shared rate limiter (`aiGeneration` rule);
 * - persists a generation-run audit row (token usage + integer-paise cost) to
 *   the append-only AuditLog on completion (Req 12.9);
 * - de-duplicates freshly generated candidates against already-stored slogans
 *   using the pure text/embedding helpers (Req 12.7);
 * - resolves the Claude client from the environment: when `ANTHROPIC_API_KEY`
 *   is absent every generation returns a clear error rather than crashing.
 *
 * The whole capability is dormant behind the `aiStudio` feature flag (Req 22.2);
 * callers (server actions/pages) additionally guard with `requireFlag`.
 *
 * Every DB touch is wrapped so an unreachable database degrades to a clear error
 * and `next build` never requires a live DB or API key.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

import {
  createAIEngine,
  createClaudeClient,
  dedupeCandidates,
  estimateRunCostPaise,
  type AIError,
  type DedupeCandidate,
  type ExistingSlogan,
  type GenParams,
  type GenerationRunAudit,
  type Slogan,
  type TokenPricingPaise,
  type TokenUsage,
} from '@/services/ai-engine';
import { config, type Config_Service } from '@/services/config';
import { createConfiguredRateLimiter, type RateLimiter } from '@/lib/rate-limit';
import { type Result, ok, err } from '@/lib/result';
import { ADMIN_ACTOR_ID } from './admin-auth';

/** Rate-limit endpoint key registered in `config.rateLimits()` (≤10/60min). */
const AI_GENERATION_ENDPOINT = 'aiGeneration';

/**
 * Default per-million-token pricing in integer paise used to estimate a run's
 * cost when the caller does not supply usage-specific pricing (Req 12.9). These
 * are conservative placeholders; real pricing can be threaded through later.
 */
export const DEFAULT_TOKEN_PRICING_PAISE: TokenPricingPaise = {
  inputPerMillionPaise: 30_000, // ₹300 / M input tokens
  outputPerMillionPaise: 150_000, // ₹1,500 / M output tokens
};

/**
 * Process-wide rate limiter so the ≤10/60min budget is shared across requests
 * (Req 12.10). Backed by the `aiGeneration` rule from the Config_Service.
 */
const globalForAi = globalThis as unknown as { aiRateLimiter?: RateLimiter };
function rateLimiter(cfg: Config_Service = config): RateLimiter {
  if (globalForAi.aiRateLimiter === undefined) {
    globalForAi.aiRateLimiter = createConfiguredRateLimiter(cfg);
  }
  return globalForAi.aiRateLimiter;
}

async function client(): Promise<PrismaClient> {
  const { getPrisma } = await import('@/lib/prisma');
  return getPrisma();
}

/** True when the Claude API key is present so generation can call the model. */
export function isClaudeConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.ANTHROPIC_API_KEY ?? '').trim().length > 0;
}

/** Alias for {@link isClaudeConfigured} (Anthropic-branded name for the UI). */
export const isAnthropicConfigured = isClaudeConfigured;

/** Write an append-only audit row; best-effort (never throws to the caller). */
async function writeAudit(
  prisma: PrismaClient,
  actionType: string,
  entityType: string,
  entityId: string,
  detail: Prisma.InputJsonValue,
  actorId: string = ADMIN_ACTOR_ID,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { actorId, actionType, entityType, entityId, detail },
    });
  } catch {
    // Auditing is best-effort; never fail the operation on a log-write failure.
  }
}

/**
 * Persist a generation-run audit row recording token usage and integer-paise
 * cost (Req 12.9). Exported so the review-queue layer can reuse it after a run.
 */
export async function recordGenerationRun(
  audit: GenerationRunAudit,
  actorId: string = ADMIN_ACTOR_ID,
): Promise<void> {
  try {
    const prisma = await client();
    await writeAudit(
      prisma,
      'AI_GENERATION_RUN',
      'AiGenerationRun',
      `${audit.collection}:${audit.tier}`,
      {
        tier: audit.tier,
        collection: audit.collection,
        model: audit.model,
        requestedCount: audit.requestedCount,
        producedCount: audit.producedCount,
        inputTokens: audit.usage.inputTokens,
        outputTokens: audit.usage.outputTokens,
        costPaise: audit.costPaise,
      },
      actorId,
    );
  } catch {
    // Best-effort audit.
  }
}

/** Load stored slogans to de-duplicate freshly generated candidates against. */
async function loadExistingSlogans(): Promise<ExistingSlogan[]> {
  try {
    const prisma = await client();
    const [products, bank] = await Promise.all([
      prisma.product.findMany({ select: { slogan: true } }),
      prisma.sloganBankEntry.findMany({ select: { text: true } }),
    ]);
    return [
      ...products.map((p) => ({ text: p.slogan })),
      ...bank.map((b) => ({ text: b.text })),
    ];
  } catch {
    return [];
  }
}

/** A completed generation run: the de-duplicated candidates plus the audit. */
export interface GenerationRunResult {
  readonly slogans: Slogan[];
  readonly audit: GenerationRunAudit;
}

/** Options for {@link runGeneration}. */
export interface RunGenerationOptions {
  /** Identifier of the admin issuing the run, for per-admin rate limiting. */
  readonly adminId?: string;
  /** Config service (injectable for tests). */
  readonly cfg?: Config_Service;
  /** Env for API-key resolution (injectable for tests). */
  readonly env?: NodeJS.ProcessEnv;
  /** Token pricing used to estimate run cost (Req 12.9). */
  readonly pricing?: TokenPricingPaise;
  /** Reported token usage; defaults to zero when the client cannot report it. */
  readonly usage?: TokenUsage;
  /** Injected existing slogans (tests); defaults to loading from the DB. */
  readonly existing?: ExistingSlogan[];
}

/**
 * Run a slogan generation end to end at the data layer (Req 12.7, 12.9, 12.10):
 *
 * 1. refuse when the `aiStudio` flag is disabled (Req 22.2);
 * 2. enforce the ≤10/admin/60min rate limit and reject when exceeded (Req 12.10);
 * 3. require `ANTHROPIC_API_KEY` — return a clear error when absent (no crash);
 * 4. call the pure AI_Engine to generate + schema-validate candidates;
 * 5. de-duplicate against stored slogans (Req 12.7);
 * 6. persist a token-usage + cost audit row (Req 12.9).
 */
export async function runGeneration(
  params: GenParams,
  options: RunGenerationOptions = {},
): Promise<Result<GenerationRunResult, AIError>> {
  const cfg = options.cfg ?? config;
  const env = options.env ?? process.env;
  const adminId = options.adminId ?? ADMIN_ACTOR_ID;

  if (!cfg.isEnabled('aiStudio')) {
    return err({ kind: 'FEATURE_DISABLED', message: 'AI Studio is not enabled' });
  }

  // Rate limit: at most 10 runs per admin per 60 minutes (Req 12.10). Rejected
  // requests are not recorded and consume no budget.
  const decision = rateLimiter(cfg).check(AI_GENERATION_ENDPOINT, adminId);
  if (!decision.allowed) {
    const retry =
      decision.retryAfterSeconds !== undefined
        ? ` Try again in ${decision.retryAfterSeconds}s.`
        : '';
    return err({
      kind: 'API_ERROR',
      message: `Too many generation requests — at most 10 per hour.${retry}`,
    });
  }

  // Require the Claude API key; degrade with a clear error rather than crashing.
  if (!isClaudeConfigured(env)) {
    return err({
      kind: 'MISSING_CONFIG',
      message:
        'ANTHROPIC_API_KEY is not configured — set it to generate slogans.',
    });
  }

  const engine = createAIEngine(createClaudeClient(env), cfg, {
    collectionExists: undefined,
  });

  const generated = await engine.generate(params);
  if (!generated.ok) return generated;

  // De-duplicate against stored slogans and within the batch (Req 12.7).
  const existing = options.existing ?? (await loadExistingSlogans());
  const candidates: DedupeCandidate[] = generated.value.map((s) => ({
    text: s.text,
  }));
  const keptTexts = new Set(
    dedupeCandidates(candidates, existing).map((c) => c.text),
  );
  const slogans = generated.value.filter((s) => keptTexts.has(s.text));

  // Record the run's token usage + integer-paise cost to the audit log (Req 12.9).
  const usage = options.usage ?? { inputTokens: 0, outputTokens: 0 };
  const pricing = options.pricing ?? DEFAULT_TOKEN_PRICING_PAISE;
  const audit: GenerationRunAudit = {
    tier: params.tier,
    collection: params.collection,
    model: cfg.claudeModelId(),
    requestedCount: params.count,
    producedCount: slogans.length,
    usage,
    costPaise: estimateRunCostPaise(usage, pricing),
  };
  await recordGenerationRun(audit, adminId);

  return ok({ slogans, audit });
}
