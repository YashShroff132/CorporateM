'use server';

/**
 * AI Review_Queue server actions (task 20, Req 15.1–15.10).
 *
 * Every action is guarded by BOTH `requireAdmin` (password gate) AND
 * `requireFlag('aiStudio')` — with the flag off (the default) `requireFlag`
 * triggers notFound(), so these actions disclose nothing about the capability
 * (Req 22.4). All mutations flow through the review-queue data layer, which
 * writes AuditLog rows for each admin action.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/server/admin-auth';
import { requireFlag } from '@/server/security/feature-flags';
import {
  approveDraft,
  bulkApproveSafeDrafts,
  editDraftSlogan,
  generateDrafts,
  regenerateDraftMockup,
  rejectDraft,
} from '@/server/review-queue-data';
import type { Tier } from '@/services/catalog';

const TIERS: readonly Tier[] = ['SAFE', 'DIRECT', 'VERY_DIRECT'];

/** Guard shared by every AI action: admin session + aiStudio flag. */
async function guard(): Promise<void> {
  await requireAdmin();
  requireFlag('aiStudio');
}

function withMessage(key: 'success' | 'error', message: string): string {
  const params = new URLSearchParams({ [key]: message });
  return `/admin/ai?${params.toString()}`;
}

export async function generateDraftsAction(formData: FormData): Promise<void> {
  await guard();

  const tierRaw = String(formData.get('tier') ?? '');
  const tier = (TIERS as readonly string[]).includes(tierRaw)
    ? (tierRaw as Tier)
    : 'SAFE';
  const collection = String(formData.get('collection') ?? '').trim();
  const countRaw = Number(formData.get('count'));
  const count = Number.isFinite(countRaw) ? Math.trunc(countRaw) : 0;
  const tone = String(formData.get('tone') ?? '').trim();
  const garmentOrColor = String(formData.get('garmentOrColor') ?? '').trim();

  if (collection.length === 0) {
    redirect(withMessage('error', 'Collection is required.'));
  }

  const result = await generateDrafts({
    tier,
    collection,
    count,
    tone: tone.length > 0 ? tone : undefined,
    garmentOrColor: garmentOrColor.length > 0 ? garmentOrColor : undefined,
  });

  if (!result.ok) {
    redirect(withMessage('error', result.message));
  }

  revalidatePath('/admin/ai');
  redirect(
    withMessage(
      'success',
      `Generated ${result.created} draft(s) from ${result.candidates.length} candidate(s).`,
    ),
  );
}

export async function approveDraftAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get('productId') ?? '');
  const result = await approveDraft(id);
  revalidatePath('/admin/ai');
  revalidatePath('/shop');
  redirect(
    result.ok
      ? withMessage('success', 'Draft approved and published.')
      : withMessage('error', result.message),
  );
}

export async function rejectDraftAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get('productId') ?? '');
  const result = await rejectDraft(id);
  revalidatePath('/admin/ai');
  redirect(
    result.ok
      ? withMessage('success', 'Draft rejected and archived.')
      : withMessage('error', result.message),
  );
}

export async function editDraftAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get('productId') ?? '');
  const slogan = String(formData.get('slogan') ?? '');
  const result = await editDraftSlogan(id, slogan);
  revalidatePath('/admin/ai');
  redirect(
    result.ok
      ? withMessage('success', 'Draft slogan updated.')
      : withMessage('error', result.message),
  );
}

export async function regenerateDraftAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get('productId') ?? '');
  const result = await regenerateDraftMockup(id);
  revalidatePath('/admin/ai');
  redirect(
    result.ok
      ? withMessage('success', result.message ?? 'Preview regenerated.')
      : withMessage('error', result.message),
  );
}

export async function bulkApproveAction(formData: FormData): Promise<void> {
  await guard();
  // Honor the checkboxes selected in the review queue; the data layer caps the
  // action at 100 and only approves SAFE PENDING_REVIEW drafts (Req 15.6).
  const ids = formData
    .getAll('productIds')
    .map((v) => String(v))
    .filter((v) => v.length > 0);
  if (ids.length === 0) {
    redirect(withMessage('error', 'Select at least one SAFE draft to bulk-approve.'));
  }
  const result = await bulkApproveSafeDrafts(ids);
  revalidatePath('/admin/ai');
  revalidatePath('/shop');
  redirect(
    result.ok
      ? withMessage('success', `Bulk-approved ${result.approved} SAFE draft(s).`)
      : withMessage('error', result.message),
  );
}
