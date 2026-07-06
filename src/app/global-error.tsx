'use client';

/**
 * Global error boundary (Req 24.6, 24.7).
 *
 * Catches errors thrown in the root layout itself, which the segment-level
 * `error.tsx` cannot handle. Because it replaces the whole document, it renders
 * its own `<html>`/`<body>`. It reports to Sentry through the non-blocking
 * reporter (no-op when unconfigured) and offers a recovery action.
 */

import { useEffect } from 'react';

import { reportError } from '@/lib/error-reporting';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, {
      source: 'global-error',
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      extra: error.digest !== undefined ? { digest: error.digest } : undefined,
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-paper text-ink antialiased">
        <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
          <h1 className="text-3xl font-black tracking-tight">
            Something broke on our end
          </h1>
          <p className="text-muted">
            A critical error stopped the page from loading. The issue has been
            logged. Please try again.
          </p>
          <button
            type="button"
            onClick={() => {
              reset();
            }}
            className="w-fit bg-highlighter px-4 py-2 text-sm font-black uppercase tracking-wide text-ink"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
