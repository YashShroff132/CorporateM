/**
 * Site URL helpers — resolve the absolute origin and build absolute/canonical
 * URLs for SEO metadata (Req 19.2 canonical URLs, Req 2.8 rel prev/next).
 *
 * The origin is sourced from configuration/environment rather than hardcoded so
 * it is correct across local, staging, and production. A sensible localhost
 * default keeps builds and tests from crashing when the variable is unset.
 */

const DEFAULT_ORIGIN = 'http://localhost:3000';

/**
 * The absolute site origin (scheme + host, no trailing slash). Reads
 * `NEXT_PUBLIC_SITE_URL` first, then falls back to `AUTH_URL`, then localhost.
 */
export function getSiteOrigin(env: Record<string, string | undefined> = process.env): string {
  const raw = env.NEXT_PUBLIC_SITE_URL ?? env.AUTH_URL ?? DEFAULT_ORIGIN;
  const trimmed = raw.trim();
  const candidate = trimmed.length > 0 ? trimmed : DEFAULT_ORIGIN;
  // Strip any trailing slash so joins produce clean paths.
  return candidate.replace(/\/+$/, '');
}

/**
 * Build an absolute URL for a path (e.g. `/shop`) with an optional query string
 * (without a leading `?`). Used for canonical and rel prev/next links so each
 * resolves to the fully-qualified page URL (Req 19.2, Req 2.8).
 */
export function absoluteUrl(path: string, query = ''): string {
  const origin = getSiteOrigin();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const suffix = query.length > 0 ? `?${query}` : '';
  return `${origin}${normalizedPath}${suffix}`;
}
