# Handoff / Context Transfer — Corporate Cult E-Commerce

This document lets another engineer (or agent) with full repo access continue the work. It describes the architecture, what is DONE, what REMAINS, and how to verify.

## Stack
- Next.js 15 (App Router) + React 19 + TypeScript (strict) + Tailwind.
- PostgreSQL via Prisma (Neon; pooler `DATABASE_URL` for runtime, direct `DIRECT_URL` for migrations).
- Payments: Razorpay (test keys currently in `.env`).
- Tests: Vitest + fast-check (property-based). Run `npx vitest run`.
- Money is ALWAYS integer paise. Never use floats for money.

## Architecture conventions
- `src/services/*` = PURE domain logic (no I/O), each with a `.test.ts`. Return `Result<T,E>` (src/lib/result.ts), don't throw for domain errors.
- `src/server/*` = data-access layer (Prisma) bridging pure services to DB. Every function degrades gracefully (returns null/[]/empty) when DB is down — never throws at build time.
- `src/app/*` = App Router pages, server actions, API routes. No-JS-friendly HTML forms + server actions.
- `src/components/*` = UI. Brand Tailwind tokens: ink, paper, corporate, highlighter, stamp-red, muted, success.
- Feature flags in `src/services/config.ts` (all default OFF). Gate flag-only routes with `requireFlag(flag)` from `src/server/security/feature-flags.ts` (renders notFound() when off).
- Admin gated by `requireAdmin()` (src/server/admin-auth.ts) — pragmatic single-password HMAC cookie (ADMIN_PASSWORD). NOT role-based yet.

## Verification gates (must stay green)
```
npx tsc --noEmit        # 0 errors
npx eslint <changed>    # clean
npx vitest run          # currently 258 passing
npx next build          # compiles with no DB/keys
```

---

## DONE (launch-ready)
- Storefront: homepage (narrative + graceful degradation), /shop (filter/sort/paginate, SSR), /collections + [slug], /product/[slug] PDP with variant selection + JSON-LD.
- Cart (guest cookie-based), checkout (address, pincode autofill, GST totals in paise), Razorpay order creation + hosted checkout + /api/payment/verify + /api/payment/webhook (idempotent, raw-body HMAC).
- Admin panel: login, dashboard, collections CRUD, products+variants CRUD, publish/unpublish, orders list + filters + CSV export + mark-shipped, audit logging on mutations.
- Notifications: order confirmation (on PAID) + shipment (on SHIPPED) emails via Resend (dev logger fallback); bounded retry; terminal failures → AuditLog.
- Growth: newsletter signup (idempotent) in footer; team-pack discount wired into checkout pricing; referral + abandoned-cart are pure flag-gated logic (dormant).
- Security (task 28.1): root middleware.ts with CSP/HSTS/X-Frame-Options/etc, same-origin CSRF (webhook exempt), Zod validation at cart/checkout/payment boundaries, feature-flag gating helper.
- SEO/analytics (25.1/25.2): sitemap.ts, robots.ts, OG/Twitter metadata, Product JSON-LD; GA4+PostHog non-blocking analytics (only when keys set).
- Performance/monitoring (29.1): next/image ProductImage (AVIF/WebP, remotePatterns https), error.tsx/global-error.tsx/not-found.tsx, minimal DSN-based Sentry reporter (bounded retry, non-blocking).
- DB: schema migrated to live Neon; seed.ts idempotent (3 collections, 8 products, 52 variants, slogans, blank templates).
- Docs: README.md (dev/deploy), SETUP-GUIDE.md (owner steps incl. git + Vercel + Razorpay KYC).

---

## REMAINING WORK

### A. AI slogan pipeline — FLAG-GATED (`aiStudio`), OPTIONAL, INTERRUPTED MID-BUILD
Pure services already exist and are tested: `src/services/ai-engine.ts` (generate + Claude call), `src/services/moderation.ts` (evaluate/route), `src/services/mockup.ts` (renderer). What's NOT wired:
- **17.2** slogan de-duplication (case-insensitive normalized text + cosine>=0.9 hook) + run auditing (token/cost to AuditLog) + <=10 runs/admin/60min via rate limiter. Add `src/server/ai-data.ts`.
- **19.2** mockup preview storage: `src/server/mockup-data.ts` — store rendered preview to object storage (R2/S3/Cloudinary via env; presigned/fetch pattern, no heavy SDK), record URL on Design + Product; on storage failure record NO url + return error; degrade to data-URL/placeholder when unconfigured.
- **20.1** admin AI review queue at `src/app/admin/ai/**` — MUST be gated by BOTH `requireAdmin()` AND `requireFlag('aiStudio')`. Generate form (tier/collection/count 1..20) → generateSlogans → moderation.evaluate → mockup render → create Design+Product PENDING_REVIEW (aiGenerated true) for ADMITted; per-item Approve(→PUBLISHED)/Edit/Regenerate(keeps PENDING_REVIEW)/Reject(→ARCHIVED); bulk-approve <=100 SAFE.
- **OWNER REQUEST — LENIENT MODERATION:** default thresholds must be lenient so good ideas aren't rejected. In config.ts the moderation defaults are review=0.4, autoReject=0.8. Change defaults to lenient (suggest review≈0.75, autoReject≈0.95) so only high-confidence violations auto-reject and the review band is narrow. Prohibited-category hits still auto-reject. Keep env-overridable (MODERATION_REVIEW_THRESHOLD / MODERATION_AUTO_REJECT_THRESHOLD).
- Needs `ANTHROPIC_API_KEY`. Claude model id from config.claudeModelId().

### B. Print-on-Demand seams — FLAG-GATED (`pod`), OPTIONAL, INTERRUPTED
- **22.1** `src/services/fulfillment.ts`: Fulfillment_Provider interface + active SELF impl + POD stub returning "not configured" WITHOUT network call.
- **22.2** fulfillment routing: SELF when pod flag off or product mode SELF; when pod on + mode POD + paid + no podOrderId → create POD order, record id; on failure leave podOrderId unset, order stays paid, record error.
- Env: POD_API_KEY / POD_BASE_URL.

### C. Optional automated tests (marked `*` in tasks.md — skipped for speed)
These are property/unit/integration/smoke tests. Core money/order/payment/cart/pdp/shop/invoice/mockup already have property tests (258 passing). Remaining optional: 6.3, 10.2, 16.4, 16.5, 17.3, 18.2, 20.2, 20.3, 22.3, 23.2, 24.2, 24.3, 25.3, 26.2, 27.2, 28.2, 28.3, 29.2, 30.2, 30.4. Each references its property numbers in tasks.md. Use fast-check, min 100 runs, tag `// Feature: corporate-cult-ecommerce, Property N: ...`.

### D. CI (30.3) — partially noted, not finalized
- Add `.github/workflows/ci.yml`: run lint, tsc, vitest, and `prisma migrate diff` drift check on PRs; block merge on failure; use Razorpay TEST keys only. Ensure separate local/staging/prod DB + secrets.

---

## IMPORTANT NOTES / GOTCHAS
- Task tracker meta at `~/.kiro/tasks/.../*.meta.json` has an intermittent Windows EPERM rename issue (Defender). tasks.md checkboxes are the source of truth; edit them directly if the tracker tool fails.
- `.env` is gitignored and contains live Neon creds + Razorpay TEST keys (user shared them in chat — consider rotating). `.env.example` is the committable template with all vars documented.
- Prisma datasource uses `url` (pooler) + `directUrl` (direct) — keep both for migrations to work.
- Security follow-up before scale: upgrade admin from single-password to role-based OTP (Req 11.1); consider nonce-based CSP (currently 'unsafe-inline' for Next/Tailwind pragmatism, documented in src/server/security/headers.ts).
- Dev server: `npm run dev` → http://localhost:3000. Admin: /admin/login (ADMIN_PASSWORD in .env).

## Suggested continuation order
1. Lenient moderation defaults (quick config change) — owner explicitly asked.
2. AI pipeline A (17.2 → 19.2 → 20.1) behind aiStudio flag.
3. POD B (22.1 → 22.2) behind pod flag.
4. CI (30.3).
5. Optional tests C as time allows.
