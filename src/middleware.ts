/**
 * Next.js root middleware — cross-cutting request concerns (task 28).
 *
 * Responsibilities:
 *   1. Security headers on EVERY response (Req 23.4, 23.5) — CSP, HSTS,
 *      X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
 *      Permissions-Policy. See `security/headers.ts` for the header set and the
 *      documented inline-content (CSP) choice.
 *   2. CSRF protection on state-changing requests via same-origin verification
 *      (Req 23.6, 23.9). Cross-origin POST/PUT/PATCH/DELETE are rejected with
 *      403 before reaching any handler or server action.
 *
 * Exemptions:
 *   - The Razorpay webhook (`/api/payment/webhook`) is a server-to-server call
 *     with no browser origin, authenticated by an HMAC signature over the raw
 *     body (Req 8.5). It is exempt from the same-origin CSRF check; its
 *     signature verification stays in the route handler and is untouched.
 *   - Next.js Server Actions (identified by the `Next-Action` header) are
 *     exempt because Next.js 15 already performs its own strict same-origin
 *     validation on Server Actions internally. Our additional check was
 *     incorrectly blocking legitimate add-to-cart and admin form submissions
 *     when Vercel's proxy forwarded the origin differently.
 *
 * Scope: the matcher below excludes static assets (`_next/static`,
 * `_next/image`) and `favicon.ico` so legitimate GET/asset traffic is never
 * blocked and headers are only spent on real document/API responses.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { applySecurityHeaders } from '@/server/security/headers';
import { isStateChangingMethod, verifySameOrigin } from '@/server/security/csrf';

/** Paths exempt from the same-origin CSRF check (HMAC-authenticated instead). */
const CSRF_EXEMPT_PATHS = new Set<string>(['/api/payment/webhook']);

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Next.js Server Actions are identified by the `Next-Action` header.
  // Next.js 15 already enforces same-origin for these internally, so we skip
  // our own check to avoid double-rejecting legitimate form submissions.
  const isServerAction = request.headers.has('next-action');

  // CSRF: verify same-origin for state-changing requests, except HMAC-verified
  // webhooks and Next.js Server Actions (Req 23.6, 23.9).
  if (
    isStateChangingMethod(request.method) &&
    !CSRF_EXEMPT_PATHS.has(pathname) &&
    !isServerAction
  ) {
    const csrf = verifySameOrigin(request);
    if (!csrf.ok) {
      const response = NextResponse.json(
        { error: 'CSRF_VALIDATION_FAILED', reason: csrf.reason },
        { status: 403 },
      );
      applySecurityHeaders(response.headers);
      return response;
    }
  }

  const response = NextResponse.next();
  applySecurityHeaders(response.headers);
  return response;
}

export const config = {
  /**
   * Run on everything except Next's static output and the favicon. This keeps
   * headers on all document + API responses while never blocking static assets
   * or image optimization (which carry no CSRF risk).
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
