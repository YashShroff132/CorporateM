/**
 * Minimal, dependency-free Sentry error reporter (Req 24.6, 24.7).
 *
 * Rather than pulling in the heavy `@sentry/nextjs` SDK, this posts a compact
 * Sentry "store" event directly to the ingest endpoint derived from the DSN.
 * It reports the error type, message, stack trace, and any provided request
 * context (Req 24.6).
 *
 * Guarantees:
 *  - No DSN configured (NEXT_PUBLIC_SENTRY_DSN / SENTRY_DSN unset) => every call
 *    is a silent no-op, so the app builds and runs without Sentry.
 *  - Delivery is retried up to 3 times on failure with a short backoff
 *    (Req 24.7).
 *  - Reporting is fire-and-forget and fully exception-safe: it NEVER throws into
 *    or blocks the in-progress request (Req 24.7).
 *
 * The Sentry ingest origin must be allowlisted in the CSP `connect-src` for
 * client-side reports to succeed (see `server/security/headers.ts`).
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 200;

/** A parsed Sentry DSN broken into the pieces the ingest URL/header need. */
interface ParsedDsn {
  publicKey: string;
  host: string;
  projectId: string;
  protocol: string;
}

/** Read the configured DSN from either the public or server-only env var. */
function readDsn(): string {
  const dsn =
    process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ?? process.env.SENTRY_DSN?.trim() ?? '';
  return dsn;
}

/**
 * Parse a Sentry DSN of the form
 * `https://<publicKey>@<host>/<projectId>` into its components. Returns
 * `null` for an empty or malformed DSN so callers degrade to a no-op.
 */
export function parseDsn(dsn: string): ParsedDsn | null {
  if (dsn.length === 0) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+/, '');
    if (url.username.length === 0 || projectId.length === 0) return null;
    return {
      publicKey: url.username,
      host: url.host,
      projectId,
      protocol: url.protocol.replace(/:$/, ''),
    };
  } catch {
    return null;
  }
}

/** Build the Sentry store-endpoint URL for a parsed DSN. */
function storeUrl(dsn: ParsedDsn): string {
  return `${dsn.protocol}://${dsn.host}/api/${dsn.projectId}/store/`;
}

/** Additional context attached to a report (Req 24.6 request context). */
export interface ErrorContext {
  /** Where the error surfaced, e.g. 'client', 'server', 'global-error'. */
  source?: string;
  /** Request URL / route, when available. */
  url?: string;
  /** Any extra, JSON-serializable tags/data. */
  extra?: Record<string, unknown>;
}

/** Normalize an unknown thrown value into type + message + stack. */
function describeError(error: unknown): {
  type: string;
  value: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return { type: error.name, value: error.message, stack: error.stack };
  }
  return { type: 'Error', value: String(error) };
}

/** Build the Sentry event payload (a minimal, valid store event). */
function buildEvent(error: unknown, context: ErrorContext): Record<string, unknown> {
  const { type, value, stack } = describeError(error);
  return {
    event_id: globalThis.crypto?.randomUUID?.().replace(/-/g, '') ?? undefined,
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: 'error',
    exception: {
      values: [{ type, value, ...(stack !== undefined ? { stacktrace: { frames: [] }, raw_stack: stack } : {}) }],
    },
    tags: { source: context.source ?? 'unknown' },
    request: context.url !== undefined ? { url: context.url } : undefined,
    extra: context.extra,
  };
}

/** Small delay helper for retry backoff. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempt to POST the event to Sentry, retrying up to {@link MAX_RETRIES} times
 * on network/HTTP failure. Always resolves (never rejects) so callers stay
 * non-blocking (Req 24.7).
 */
async function deliver(url: string, authHeader: string, body: string): Promise<void> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sentry-Auth': authHeader,
        },
        body,
        // Keep the request alive past page transitions where supported.
        keepalive: true,
      });
      if (res.ok) return;
    } catch {
      // Ignore and retry.
    }
    if (attempt < MAX_RETRIES) {
      await delay(RETRY_DELAY_MS * (attempt + 1));
    }
  }
}

/**
 * Report a runtime error to Sentry (Req 24.6). Fire-and-forget and
 * exception-safe: returns immediately and never throws into the caller's flow
 * (Req 24.7). No-ops when no DSN is configured.
 */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  try {
    const parsed = parseDsn(readDsn());
    if (parsed === null) return; // Sentry not configured — no-op.

    const authHeader = [
      'Sentry sentry_version=7',
      'sentry_client=corporate-cult-min/1.0',
      `sentry_key=${parsed.publicKey}`,
    ].join(', ');

    const body = JSON.stringify(buildEvent(error, context));
    // Fire-and-forget: do not await, and swallow any rejection.
    void deliver(storeUrl(parsed), authHeader, body).catch(() => {});
  } catch {
    // Never let error reporting itself break the request (Req 24.7).
  }
}

/** True when a Sentry DSN is configured (useful for conditional UI/tests). */
export function isSentryConfigured(): boolean {
  return parseDsn(readDsn()) !== null;
}
