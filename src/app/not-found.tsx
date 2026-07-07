/**
 * Branded 404 page (Req 24.x). Server component rendered for unmatched routes
 * and `notFound()` calls. Keeps the tone on-brand and offers a route back into
 * the store.
 */

import Link from 'next/link';

export const metadata = {
  title: 'Page Not Found',
};

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <p className="text-sm font-bold uppercase tracking-wide text-muted">
        Error 404
      </p>
      <h1 className="text-4xl font-black tracking-tight">
        This page filed for a transfer
      </h1>
      <p className="text-muted">
        The page you were looking for isn&apos;t here. It may have been moved,
        archived, or it never existed. Let&apos;s get you back to something real.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/shop"
          className="bg-highlighter px-4 py-2 text-sm font-black uppercase tracking-wide text-ink"
        >
          Browse the shop
        </Link>
        <Link
          href="/"
          className="border border-ink px-4 py-2 text-sm font-bold uppercase tracking-wide"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
