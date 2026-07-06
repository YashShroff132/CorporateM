# Setup Guide — What YOU Need To Do

This is your checklist to take the store live. Do these in order. You do NOT need to touch any code — you're just creating accounts and pasting keys into one file (`.env`).

---

## 1. Database (Neon) — free, ~5 min

The store needs a place to store products, orders, etc. We use Neon (free Postgres).

1. Go to **neon.com** → **Sign up** (use Google/GitHub, it's fastest).
2. Click **New Project**, give it any name (e.g. "corporate-cult"), pick region **AWS Asia Pacific (Mumbai)**, click **Create**.
3. On the project dashboard, click the **Connect** button.
4. Copy the **connection string**. It looks like:
   `postgresql://user:password@ep-xxx.ap-south-1.aws.neon.tech/dbname?sslmode=require`
5. Paste it into `.env` as: `DATABASE_URL="...paste here..."`

That's it for the database account.

---

## 2. Razorpay (payments) — the longer one

To accept real money you must finish Razorpay's KYC. This is an RBI legal requirement in India — no gateway can process live payments without it. Budget a day or two for their review.

**A. Sign up & get TEST keys (do this first, works immediately)**
1. Go to **razorpay.com** → **Sign Up**.
2. In the Dashboard, switch to **Test Mode** (toggle, top of screen).
3. Go to **Settings → API Keys → Generate Test Key**.
4. Copy the **Key ID** and **Key Secret**. Paste into `.env`:
   - `RAZORPAY_KEY_ID="rzp_test_..."`
   - `RAZORPAY_KEY_SECRET="...secret..."`
5. This lets you test the whole checkout with fake cards before going live.

**B. Complete KYC for LIVE keys (when ready to sell)**
Keep these documents handy:
- **PAN card** (personal or business)
- **Aadhaar** of the PAN holder
- **Bank account** number + IFSC (where your money gets deposited)
- **GSTIN** (if you have one)
- Your **website URL** with visible Refund, Privacy, Terms, Shipping, and Contact pages — *these already exist in your store at /legal/*, which is exactly what Razorpay checks.*

Submit these under **Account Activation** in the Dashboard. Once approved, switch to **Live Mode**, generate **Live API Keys**, and replace the test keys in `.env` with the `rzp_live_...` ones.

**C. Webhook (after deploying)**
In Razorpay Dashboard → **Settings → Webhooks → Add**:
- URL: `https://YOUR-SITE.com/api/payment/webhook`
- Copy the **webhook secret** it gives you into `.env` as `RAZORPAY_WEBHOOK_SECRET="..."`

---

## 3. Admin login — set your own password

To manage products, pick any password and put it in `.env`:
- `ADMIN_PASSWORD="choose-a-strong-password"`
- `ADMIN_SESSION_SECRET="any-long-random-string"`

You'll log in at `yoursite.com/admin/login` with this password.

---

## 4. Fill in your brand/legal info

Open `.env.example` — it lists every variable with comments. Copy it to `.env` and fill in the brand ones (`BRAND_NAME`, `SELLER_GSTIN`, `SUPPORT_EMAIL`, `BUSINESS_ADDRESS`, etc.). Anything you leave blank shows as a bracketed placeholder on the site.

---

## 4b. Put the project on GitHub (needed for Vercel)

Do this once, in a terminal in the project folder:
```
git init
git add .
git commit -m "Initial commit"
```
Then create an empty repo on **github.com** (click New repository, don't add a README), and it will show you two commands to run — they look like:
```
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git branch -M main
git push -u origin main
```
Your `.env` file is safe — it's gitignored and will NOT be uploaded. Only `.env.example` (the blank template) goes to GitHub.

---

## 5. Load the database + go live

Once `DATABASE_URL` is set, run these once (in a terminal in the project folder):
```
npx prisma migrate deploy
npx prisma db seed
```
This creates the tables and adds sample products so the shop isn't empty.

Then deploy:
1. Push the project to **GitHub**.
2. Go to **vercel.com** → **Sign up** → **Add New Project** → import your GitHub repo.
3. In Vercel's **Environment Variables** screen, paste everything from your `.env`.
4. Click **Deploy**. Done — your store is live.

---

## Optional (turn on later, all OFF by default)
These are extra features you can enable anytime by setting a flag to `true` in `.env` — none are needed to launch:
- `FLAG_AI_STUDIO` — AI slogan generator in admin (needs `ANTHROPIC_API_KEY`)
- `FLAG_POD` — print-on-demand fulfillment (needs a POD provider account)
- Email receipts: set `RESEND_API_KEY` + `FROM_EMAIL` (from resend.com, free tier)
- Analytics: `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_POSTHOG_KEY`

---

### Quick order of operations
1. Neon → get `DATABASE_URL`
2. Razorpay test keys → test checkout
3. Set admin password + brand info
4. `prisma migrate deploy` + `db seed`
5. Deploy to Vercel
6. Razorpay KYC → swap in live keys + webhook → start selling
