# Out of Office

A mobile-first, SEO-strong D2C e-commerce store for corporate-humor T-shirts in
India. Built on Next.js 15 (App Router) + TypeScript + Tailwind CSS + Prisma
(PostgreSQL), with Razorpay payments and GST-compliant invoicing. All money is
handled as integer paise (1 INR = 100 paise).

## Prerequisites

- Node.js 20+ and npm
- A PostgreSQL database (Neon recommended — see below)
- A Razorpay account (test keys to start, live keys for production)

## 1. Install

```bash
npm install
```

Copy the example environment file and fill in values:

```bash
cp .env.example .env
```

See `.env.example` for the full, grouped list of variables. The app validates
required brand/tax/legal config at startup (`validateStartup()`), so the
`BRAND_*`, `GST_*`, `SELLER_*`, `LEGAL_ENTITY_*`, and `CLAUDE_MODEL_ID` values
must be present to boot.

## 2. Get a free Neon Postgres database

1. Sign up at https://neon.tech and create a new project.
2. In the project dashboard, open **Connection Details** and copy the
   connection string (use the **pooled** connection).
3. Paste it into `.env` as `DATABASE_URL`. Keep `sslmode=require`, e.g.:

   ```
   DATABASE_URL="postgresql://user:pass@ep-xxx.aws.neon.tech/dbname?sslmode=require"
   ```

## 3. Set up the database schema and seed data

Apply migrations, then seed sample catalog data:

```bash
npx prisma migrate deploy
npx prisma db seed
```

The seed is **idempotent** — running `npx prisma db seed` again will not create
duplicates. It creates a few collections, ~8 published products with variants,
plus slogan-bank and blank-template rows so the shop is not empty on first
launch.

During local development you can instead use `npx prisma migrate dev`, which
runs migrations and the seed automatically.

## 4. Run the dev server

```bash
npm run dev
```

Open http://localhost:3000.

Useful checks:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run test        # vitest run
npm run build       # next build
```

## 5. Admin password

The admin panel at `/admin` is gated by a single password plus a signed session
cookie. Set both in `.env`:

```
ADMIN_PASSWORD="choose-a-strong-password"
ADMIN_SESSION_SECRET="a-long-random-string"
```

Generate a strong `ADMIN_SESSION_SECRET`, for example:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 6. Razorpay keys (test vs live)

Add your keys to `.env`:

```
RAZORPAY_KEY_ID=""
RAZORPAY_KEY_SECRET=""
RAZORPAY_WEBHOOK_SECRET=""
```

- **Test:** In the Razorpay Dashboard switch to **Test Mode** and use the test
  Key ID/Secret for all non-production environments.
- **Live:** Complete Razorpay's live-account activation (this requires the
  legal pages below to be reachable), then switch to **Live Mode** and use the
  live Key ID/Secret in production only.
- **Webhook secret:** Create a webhook in the Razorpay Dashboard pointing to
  `https://<your-domain>/api/payment/webhook` and set the same secret as
  `RAZORPAY_WEBHOOK_SECRET`.

### Legal pages for Razorpay review

Razorpay checks that these pages are reachable before approving a live account.
They are all linked from the site footer:

- `/legal/privacy` — Privacy Policy
- `/legal/terms` — Terms & Conditions
- `/legal/refunds` — Returns & Refund Policy
- `/legal/shipping` — Shipping Policy
- `/legal/contact` — Contact Us (incl. grievance officer)

The content is a good-faith template marked *pending final legal review*. Fill
in `SUPPORT_EMAIL`, `GRIEVANCE_OFFICER_NAME`, `BUSINESS_ADDRESS`, and the legal
entity details in `.env` before going live, and have the pages reviewed by a
lawyer.

## 7. Deploy to Vercel

1. Push this repo to GitHub/GitLab.
2. Go to https://vercel.com and **Import Project**, selecting the repo.
   Vercel auto-detects Next.js — no `vercel.json` is needed.
3. In **Project Settings → Environment Variables**, add every variable from
   `.env.example` (use your **live** Razorpay keys and production `DATABASE_URL`
   for the Production environment). Set `NEXT_PUBLIC_SITE_URL` and `AUTH_URL` to
   your production domain.
4. Run the database migration and seed against your production database once
   (locally, with the production `DATABASE_URL`):

   ```bash
   npx prisma migrate deploy
   npx prisma db seed
   ```

5. Click **Deploy**. Vercel runs `next build` and hosts the app.

The build (`npx next build`) does not require a live database or Razorpay keys —
the Prisma client is instantiated lazily on first use.
