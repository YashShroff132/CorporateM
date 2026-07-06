'use client';

/**
 * Route-segment error boundary (Req 24.6, 24.7).
 *
 * Renders a friendly, branded error page for unhandled runtime errors in a
 * route segment and reports the error to Sentry via the non-blocking reporter.
 * Reporting never blocks or breaks the recovery UI; if Sentry is unconfigured
 * it is a silent no-op.
 */

import { useEffect } from 'react';

import { reportError } from '@/lib/error-reporting';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, {
      source: 'error-boundary',
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      extra: error.digest !== undefined ? { digest: error.digest } : undefined,
    });
  }, [error]);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="text-3xl font-black tracking-tight">
        Something broke on our end
      </h1>
      <p className="text-muted">
        A gremlin got into the machinery. The issue has been logged. You can try
        again, or head back to the shop.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            reset();
          }}
          className="bg-highlighter px-4 py-2 text-sm font-black uppercase tracking-wide text-ink"
        >
          Try again
        </button>
        <a
          href="/shop"
          className="border border-ink px-4 py-2 text-sm font-bold uppercase tracking-wide"
        >
          Back to shop
        </a>
      </div>
    </main>
  );
}
