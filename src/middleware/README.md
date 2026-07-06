# Middleware

Cross-cutting request concerns enforced before handlers run:

- Feature-flag gating — `src/server/security/feature-flags.ts` (`requireFlag`)
- CSRF verification — `src/server/security/csrf.ts` (`verifySameOrigin`)
- Zod validation at trust boundaries — `src/server/security/schemas.ts`
- Security headers (CSP / HSTS / X-Frame-Options / Referrer-Policy / Permissions-Policy) — `src/server/security/headers.ts`

The Next.js entry point is `src/middleware.ts` (repo `src/` convention). It
applies the security headers to every non-static response and performs the
same-origin CSRF check on state-changing requests. The Razorpay webhook route is
exempt from the CSRF check because it is authenticated by an HMAC signature over
the raw request body, not by a browser origin.

Rate limiting per source identifier is provided by `src/lib/rate-limit.ts` and is
wired into the OTP/auth/AI-generation endpoints as those capabilities land.
