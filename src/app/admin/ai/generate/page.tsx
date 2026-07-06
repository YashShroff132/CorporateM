/**
 * /admin/ai/generate — the AI slogan generation form (task 20, Req 12.1, 15.1).
 *
 * Gated by BOTH requireAdmin AND requireFlag('aiStudio'): with the flag OFF (the
 * default) this route 404s and discloses nothing (Req 22.4). The form collects
 * tier, collection, count (1..20), tone, and garment/color, then submits to the
 * generate action which runs the AI_Engine → Moderation_Gate → Mockup pipeline
 * and creates PENDING_REVIEW drafts for admitted candidates.
 */

import Link from 'next/link';

import { requireAdmin } from '@/server/admin-auth';
import { requireFlag } from '@/server/security/feature-flags';
import { isAnthropicConfigured } from '@/server/ai-data';
import { listCollectionOptions } from '@/server/admin-data';
import { AdminShell, Field, Notice, inputClass, primaryButtonClass, secondaryButtonClass } from '../../ui';
import { generateDraftsAction } from '../actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ error?: string; notice?: string }>;
}

export default async function GenerateDraftsPage({ searchParams }: PageProps) {
  await requireAdmin();
  requireFlag('aiStudio');

  const { error, notice } = await searchParams;
  const collections = await listCollectionOptions();
  const anthropicReady = isAnthropicConfigured();

  return (
    <AdminShell
      title="Generate AI Drafts"
      actions={
        <Link href="/admin/ai" className={secondaryButtonClass}>
          Back to queue
        </Link>
      }
    >
      {error !== undefined && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {notice !== undefined && (
        <div className="mb-4">
          <Notice kind="success">{notice}</Notice>
        </div>
      )}
      {!anthropicReady && (
        <div className="mb-4">
          <Notice kind="error">
            AI generation is not configured. Set ANTHROPIC_API_KEY and CLAUDE_MODEL_ID
            to enable slogan generation.
          </Notice>
        </div>
      )}

      <form action={generateDraftsAction} className="max-w-xl space-y-5">
        <Field label="Tier" htmlFor="tier">
          <select id="tier" name="tier" className={inputClass} defaultValue="SAFE">
            <option value="SAFE">SAFE (Safe for Standup)</option>
            <option value="DIRECT">DIRECT (Reply All)</option>
            <option value="VERY_DIRECT">VERY_DIRECT (Notice Period Energy)</option>
          </select>
        </Field>

        <Field label="Collection" htmlFor="collection" hint="Slogans are generated for this collection.">
          {collections.length > 0 ? (
            <select id="collection" name="collection" className={inputClass}>
              {collections.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.title}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="collection"
              name="collection"
              type="text"
              className={inputClass}
              placeholder="collection-slug"
            />
          )}
        </Field>

        <Field label="Count" htmlFor="count" hint="How many candidate slogans to request (1–20).">
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

        <Field label="Tone" htmlFor="tone" hint="e.g. deadpan, sarcastic, dry.">
          <input
            id="tone"
            name="tone"
            type="text"
            className={inputClass}
            defaultValue="deadpan corporate"
          />
        </Field>

        <Field label="Garment or color" htmlFor="garmentOrColor">
          <input
            id="garmentOrColor"
            name="garmentOrColor"
            type="text"
            className={inputClass}
            defaultValue="Black tee"
          />
        </Field>

        <button type="submit" className={primaryButtonClass} disabled={!anthropicReady}>
          Generate
        </button>
      </form>
    </AdminShell>
  );
}
