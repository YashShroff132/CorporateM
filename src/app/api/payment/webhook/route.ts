/**
 * POST /api/payment/webhook — receive and apply Razorpay webhooks.
 *
 * Razorpay signs the webhook with an HMAC-SHA256 of the RAW request body using
 * the webhook secret, sent in the `X-Razorpay-Signature` header. We therefore
 * read the raw body (never a re-serialized JSON) and verify it before applying
 * any state change (Req 8.5). Application is idempotent via the Payment_Service
 * `applyWebhook` (Req 8.6): re-delivering the same webhook makes no further
 * change.
 *
 * We always respond 200 to a verified webhook (even when it produced no change)
 * so Razorpay stops retrying; an unverified webhook returns 400.
 *
 * NOTE (task 28 hardening): add replay-window checks and rate limiting.
 */

import { NextResponse } from 'next/server';

import { applyWebhookToOrder } from '@/server/payment-data';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  // Read the RAW body for signature verification (Req 8.5). Do not JSON.parse
  // before verifying — the signature is computed over these exact bytes.
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';

  const result = await applyWebhookToOrder(rawBody, signature);

  if (!result.verified) {
    return NextResponse.json(
      { ok: false, reason: result.reason ?? 'INVALID_SIGNATURE' },
      { status: 400 },
    );
  }

  // Verified — acknowledge so Razorpay stops retrying, reporting whether this
  // delivery changed state (idempotent for duplicates, Req 8.6).
  return NextResponse.json({ ok: true, changed: result.changed, status: result.status });
}
