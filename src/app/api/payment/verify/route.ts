/**
 * POST /api/payment/verify — verify a Razorpay checkout callback server-side.
 *
 * The client posts { razorpay_payment_id, razorpay_order_id, razorpay_signature }
 * after Razorpay Checkout succeeds. We verify the HMAC signature with the
 * server-side secret (Req 8.3) and, on success, transition the order to PAID and
 * store the payment ids (Req 8.4, 8.7). On failure the order is left unpaid.
 *
 * Task 28 hardening applied here:
 *   - CSRF: same-origin verification for this state-changing request (Req 23.6,
 *     23.9). The root middleware also enforces this; the in-route check is
 *     defense-in-depth so the route is safe regardless of matcher scope.
 *   - Validation: the request body is validated against a Zod schema before any
 *     processing, returning field-level errors on failure (Req 23.1, 23.2).
 */

import { NextResponse } from 'next/server';

import { verifyAndMarkPaid } from '@/server/payment-data';
import { verifySameOrigin } from '@/server/security/csrf';
import { fieldErrors, paymentVerifySchema } from '@/server/security/schemas';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  // CSRF: reject cross-origin state-changing requests (Req 23.6, 23.9).
  const csrf = verifySameOrigin(request);
  if (!csrf.ok) {
    return NextResponse.json(
      { verified: false, error: 'CSRF_VALIDATION_FAILED' },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { verified: false, error: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  // Validate the body against the Zod schema before any processing (Req 23.1).
  const parsed = paymentVerifySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { verified: false, error: 'INVALID_INPUT', fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const result = await verifyAndMarkPaid({
    razorpayOrderId: parsed.data.razorpay_order_id,
    razorpayPaymentId: parsed.data.razorpay_payment_id,
    razorpaySignature: parsed.data.razorpay_signature,
    method: parsed.data.method,
  });

  if (!result.verified) {
    // Signature mismatch or missing config — leave the order unpaid (Req 8.4).
    return NextResponse.json({ verified: false }, { status: 400 });
  }

  return NextResponse.json({ verified: true, status: result.status });
}
