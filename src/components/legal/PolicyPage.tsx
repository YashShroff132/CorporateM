/**
 * Shared layout primitives for legal / policy pages (Requirement 21).
 *
 * Every policy page renders a visible "pending legal review" notice at the top
 * (Req 21.2) and continues to show it until an Owner_Input legal-approval marker
 * is set. Because no page has been legally approved yet, the notice always
 * shows. Missing Owner_Input legal text is rendered via {@link Placeholder} as a
 * clearly identifiable marker rather than fabricated binding legal language
 * (Req 21.6).
 */

import type { ReactNode } from 'react';

/** The standard visible notice shown at the top of every policy page (Req 21.2). */
export function PendingLegalReviewNotice() {
  return (
    <div
      role="note"
      className="border-l-4 border-stamp-red bg-stamp-red/5 px-4 py-3 text-sm font-semibold text-ink"
    >
      This policy is pending final legal review. It is provided as a good-faith
      template and does not yet constitute final, legally binding terms.
    </div>
  );
}

/**
 * A clearly identifiable placeholder for Owner_Input legal text that has not yet
 * been provided (Req 21.6). Renders the given value when present, otherwise a
 * bracketed marker so no fabricated legal detail is shown.
 */
export function Placeholder({ value, label }: { value: string; label: string }) {
  const trimmed = value.trim();
  if (trimmed.length > 0) return <>{trimmed}</>;
  return (
    <span className="rounded bg-highlighter/40 px-1 font-mono text-sm text-ink">
      [{label}]
    </span>
  );
}

/** Consistent page shell: heading, last-updated line, and the review notice. */
export function PolicyPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-black tracking-tight text-ink">{title}</h1>
        <PendingLegalReviewNotice />
      </header>
      <div className="prose-policy flex flex-col gap-5 text-ink/90">{children}</div>
    </main>
  );
}

/** A titled section within a policy page. */
export function PolicySection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-bold tracking-tight text-ink">{heading}</h2>
      {children}
    </section>
  );
}
