/**
 * Security response headers (Req 23.4, 23.5).
 *
 * Applied to every response by the root middleware. The set covers:
 *   - Content-Security-Policy: allowlists the origins the app legitimately
 *     loads from — self, Razorpay checkout + API, and the GA4/PostHog analytics
 *     origins (Req 23.4). GSAP and Three.js ship as bundled first-party modules
 *     (served from 'self'); no third-party CDN origin is required for them.
 *   - Strict-Transport-Security: max-age >= 31,536,000s, includeSubDomains,
 *     preload (Req 23.5).
 *   - X-Frame-Options: DENY — forbids cross-origin framing (Req 23.5).
 *   - X-Content-Type-Options: nosniff.
 *   - Referrer-Policy: strict-origin-when-cross-origin (Req 23.5).
 *   - Permissions-Policy: disables sensor/geolocation/payment APIs we don't use.
 *
 * CSP inline-content choice (documented per task 28):
 *   We use 'unsafe-inline' for BOTH script-src and style-src as a pragmatic,
 *   functional baseline rather than a per-request nonce. Rationale:
 *     - Tailwind + Next inject inline <style>, and Next's App Router injects
 *       inline bootstrap/hydration <script> tags; a nonce would have to be
 *       threaded through every statically-rendered route, which would force
 *       otherwise-static pages to become dynamic and risk breaking the
 *       build/SSG output.
 *     - Razorpay's checkout.js is injected client-side by a bundled component,
 *       so a strict nonce+'strict-dynamic' policy adds fragility for little
 *       gain at this stage.
 *   The host allowlist is still enforced (external scripts/frames/connections
 *   are restricted to the named origins). Tightening to a nonce-based policy is
 *   tracked as a follow-up hardening step.
 */

/** Razorpay checkout script + API origins (Req 23.4). */
const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com';
const RAZORPAY_API = 'https://api.razorpay.com';
const RAZORPAY_FRAME = 'https://api.razorpay.com https://checkout.razorpay.com';

/** GA4 (Google Tag Manager + Analytics) origins (Req 23.4). */
const GA_SCRIPT = 'https://www.googletagmanager.com https://www.google-analytics.com';
const GA_CONNECT =
  'https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com';

/** PostHog analytics origins (Req 23.4). */
const POSTHOG = 'https://*.posthog.com';

/**
 * Sentry error-ingest origins (Req 24.6). Client-side error reports POST to the
 * project's ingest host; allow the Sentry SaaS ingest domains in connect-src.
 * (The DSN host is a subdomain of ingest.sentry.io / sentry.io.)
 */
const SENTRY_CONNECT = 'https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.sentry.io';

/** One year in seconds — the minimum required HSTS max-age (Req 23.5). */
const HSTS_MAX_AGE = 31_536_000;

/**
 * Build the Content-Security-Policy value. `dev` relaxes script-src with
 * 'unsafe-eval' so Next's development tooling (React refresh, eval'd source
 * maps) works; production omits it.
 */
export function buildContentSecurityPolicy(dev: boolean): string {
  const scriptExtra = dev ? " 'unsafe-eval'" : '';
  const directives: string[] = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${scriptExtra} ${RAZORPAY_SCRIPT} ${GA_SCRIPT} ${POSTHOG}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${RAZORPAY_API} ${GA_CONNECT} ${POSTHOG} ${SENTRY_CONNECT}`,
    `frame-src 'self' ${RAZORPAY_FRAME}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ];
  return directives.join('; ');
}

/**
 * Compute the full set of security headers for a response. Returned as plain
 * entries so the caller can apply them to a `Headers`/`NextResponse`.
 */
export function securityHeaders(
  dev: boolean = process.env.NODE_ENV !== 'production',
): Record<string, string> {
  return {
    'Content-Security-Policy': buildContentSecurityPolicy(dev),
    'Strict-Transport-Security': `max-age=${HSTS_MAX_AGE}; includeSubDomains; preload`,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  };
}

/** Apply the security headers onto a mutable Headers instance in place. */
export function applySecurityHeaders(
  headers: Headers,
  dev: boolean = process.env.NODE_ENV !== 'production',
): void {
  for (const [name, value] of Object.entries(securityHeaders(dev))) {
    headers.set(name, value);
  }
}
