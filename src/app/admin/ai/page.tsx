/**
 * /admin/ai — AI Studio & Review Queue (task 20, Req 15.1–15.10).
 *
 * Gated by BOTH requireAdmin AND requireFlag('aiStudio'): when the aiStudio flag
 * is disabled the page renders a 404 via notFound() and discloses no capability
 * content (Req 22.4). When enabled it offers a generate form and the review
 * queue of PENDING_REVIEW drafts with per-item and bulk actions.
 */

import { requireAdmin } from '@/server/admin-auth';
import { requireFlag } from '@/server/security/feature-flags';
import {
  listCollectionOptionsForAi,
  listPendingDrafts,
} from '@/server/review-queue-data';
import {
  AdminShell,
  Field,
  Notice,
  dangerButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../ui';
import {
  approveDraftAction,
  bulkApproveAction,
  editDraftAction,
  generateDraftsAction,
  regenerateDraftAction,
  rejectDraftAction,
} from './actions';

export const dynamic = 'force-dynamic';

const TIERS = ['SAFE', 'DIRECT', 'VERY_DIRECT'] as const;

export default async function AiStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  // Gate: admin session first, then the aiStudio flag. Flag off → 404 (Req 22.4).
  await requireAdmin();
  requireFlag('aiStudio');

  const params = await searchParams;
  const [collections, drafts] = await Promise.all([
    listCollectionOptionsForAi(),
    listPendingDrafts(),
  ]);

  return (
    <AdminShell title="AI Studio">
      <div className="space-y-8">
        {params.error !== undefined && <Notice kind="error">{params.error}</Notice>}
        {params.success !== undefined && (
          <Notice kind="success">{params.success}</Notice>
        )}

        <section className="rounded border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-lg font-black uppercase tracking-tight">
            Generate slogans
          </h2>
          {collections.length === 0 ? (
            <Notice kind="info">
              No collections found. Create a collection first so generated drafts
              have a home.
            </Notice>
          ) : (
            <form action={generateDraftsAction} className="grid gap-4 sm:grid-cols-2">
              <Field label="Tier" htmlFor="tier">
                <select id="tier" name="tier" className={inputClass} defaultValue="SAFE">
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Collection" htmlFor="collection">
                <select id="collection" name="collection" className={inputClass}>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Count (1–20)" htmlFor="count">
                <input
                  id="count"
                  name="count"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={5}
                  className={inputClass}
                />
              </Field>
              <Field label="Tone" htmlFor="tone" hint="e.g. deadpan, sarcastic">
                <input id="tone" name="tone" className={inputClass} placeholder="deadpan corporate" />
              </Field>
              <Field label="Garment or color" htmlFor="garmentOrColor">
                <input
                  id="garmentOrColor"
                  name="garmentOrColor"
                  className={inputClass}
                  placeholder="Black Classic Tee"
                />
              </Field>
              <div className="sm:col-span-2">
                <button type="submit" className={primaryButtonClass}>
                  Generate drafts
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="rounded border border-ink/10 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black uppercase tracking-tight">
              Review queue
            </h2>
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              {drafts.length} pending
            </span>
          </div>

          {drafts.length === 0 ? (
            <Notice kind="info">No pending drafts. Generate some slogans above.</Notice>
          ) : (
            <>
              {/* Bulk-approve SAFE drafts (Req 15.6) - decoupled using form="bulk-approve-form". */}
              <div className="space-y-4">
                <div className="space-y-4">
                  {drafts.map((d) => (
                    <div
                      key={d.productId}
                      className="rounded border border-ink/10 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {d.tier === 'SAFE' && (
                              <input
                                type="checkbox"
                                name="productIds"
                                value={d.productId}
                                form="bulk-approve-form"
                                aria-label={`Select ${d.slogan} for bulk approve`}
                              />
                            )}
                            <span className="rounded bg-corporate/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-corporate">
                              {d.tier}
                            </span>
                          </div>
                          <p className="mt-2 text-base font-bold text-ink">{d.slogan}</p>
                          {d.riskFlags.length > 0 && (
                            <p className="mt-1 text-xs text-muted">
                              Risk flags: {d.riskFlags.join(', ')}
                            </p>
                          )}
                        </div>
                        {d.mockupUrl !== null && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={d.mockupUrl}
                            alt={`Preview for ${d.slogan}`}
                            className="h-24 w-24 rounded border border-ink/10 object-contain"
                          />
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <form action={approveDraftAction}>
                          <input type="hidden" name="productId" value={d.productId} />
                          <button type="submit" className={primaryButtonClass}>
                            Approve &amp; publish
                          </button>
                        </form>
                        <form action={regenerateDraftAction}>
                          <input type="hidden" name="productId" value={d.productId} />
                          <button type="submit" className={secondaryButtonClass}>
                            Regenerate mockup
                          </button>
                        </form>
                        <form action={rejectDraftAction}>
                          <input type="hidden" name="productId" value={d.productId} />
                          <button type="submit" className={dangerButtonClass}>
                            Reject
                          </button>
                        </form>
                      </div>

                      <form
                        action={editDraftAction}
                        className="mt-3 flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="productId" value={d.productId} />
                        <div className="flex-1">
                          <span className={labelClass}>Edit slogan</span>
                          <input
                            name="slogan"
                            defaultValue={d.slogan}
                            className={inputClass}
                          />
                        </div>
                        <button type="submit" className={secondaryButtonClass}>
                          Save edit
                        </button>
                      </form>
                    </div>
                  ))}
                </div>

                <form id="bulk-approve-form" action={bulkApproveAction} className="pt-2">
                  <button type="submit" className={secondaryButtonClass}>
                    Bulk-approve selected SAFE drafts (≤100)
                  </button>
                </form>
              </div>
            </>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
