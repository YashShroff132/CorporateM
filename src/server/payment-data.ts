/**
 * Payment data-access + Payment_Service orchestration.
 *
 * Wires the pure Payment_Service (Razorpay order creation, signature/webhook
 * verification, checkout options) to the persisted Order rows. Razorpay
 * credentials are read from env via the Config_Service — the secret and webhook
 * secret are never sent to the client or stored in the DB (Req 8.9). Only the
 * publishable key id reaches the browser through `checkoutOptions`.
 *
 * When Razorpay keys are absent every function degrades gracefully: order
 * creation is skipped/returns an error, and verification fails closed leaving
 * the order unpaid, so the build never requires live keys.
 */

import {
  createPaymentService,
  createRazorpayHttpClient,
  serviceabilityFromDirectory,
  type RazorpayCheckoutOptions,
  type PaymentStatus,
  type WebhookResult,
} from '@/services/payment';
import { transitionOrder, type Order, type OrderStatus } from '@/services/order';
import { config } from '@/services/config';
import { isErr } from '@/lib/result';
import { makePaise, type Paise } from '@/lib/money';
import { pincodeDirectory } from './pincode-directory';

/** Shared Payment_Service bound to the real Razorpay HTTP client + config. */
const paymentService = createPaymentService(
  createRazorpayHttpClient(config),
  config,
  serviceabilityFromDirectory(pincodeDirectory),
);

/** True when Razorpay is configured enough to open checkout (public key id). */
export function isRazorpayConfigured(): boolean {
  return config.razorpayKeyId().trim().length > 0;
}

/**
 * Fire-and-forget the order-confirmation notification for a newly-PAID order
 * (Req 18.1, 10.3). Dynamically imported so the notification wiring is never on
 * the critical import path, and fully swallowed so it can never block or throw
 * into the payment flow (Req 18.4, 18.5).
 */
function dispatchOrderConfirmation(orderId: string): void {
  void (async () => {
    try {
      const { sendOrderConfirmationForOrder } = await import('./notification-data');
      await sendOrderConfirmationForOrder(orderId);
    } catch {
      // Notifications must never disturb the order flow.
    }
  })();
}

/**
 * Fire-and-forget fulfillment routing for a newly-PAID order (Req 16.6–16.9).
 * Dormant by default: with the `pod` flag off this resolves to self-fulfillment
 * and makes no POD network call. Dynamically imported and fully swallowed so it
 * can never block or throw into the payment flow.
 */
function dispatchFulfillmentRouting(orderId: string): void {
  void (async () => {
    try {
      const { routeOrderFulfillment } = await import('./fulfillment-data');
      await routeOrderFulfillment(orderId);
    } catch {
      // Fulfillment routing must never disturb the order flow.
    }
  })();
}

/**
 * Create a Razorpay order for a persisted local order and store its id on the
 * order row. No-op (returns false) when keys are missing, the order is absent,
 * already has a Razorpay order, or the API/DB call fails — leaving the order
 * unpaid (Req 8.1, 8.10).
 */
export async function createRazorpayOrderForOrder(orderId: string): Promise<boolean> {
  if (!isRazorpayConfigured()) return false;
  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, total: true, currency: true, razorpayOrderId: true },
    });
    if (order === null) return false;
    if (order.razorpayOrderId !== null && order.razorpayOrderId.length > 0) {
      return true; // idempotent — already created
    }

    const total = makePaise(order.total);
    if (isErr(total)) return false;

    const ref = await paymentService.createRazorpayOrder({
      id: order.id,
      total: total.value,
      currency: order.currency,
    });
    if (isErr(ref)) return false;

    await prisma.order.update({
      where: { id: order.id },
      data: { razorpayOrderId: ref.value.razorpayOrderId },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the client checkout options for an order's Razorpay order id. Returns
 * null when keys are missing or the order has no Razorpay order yet. The
 * returned options contain only the public key id — never the secret (Req 8.9).
 */
export async function checkoutOptionsForOrder(
  orderId: string,
): Promise<RazorpayCheckoutOptions | null> {
  if (!isRazorpayConfigured()) return null;
  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, total: true, currency: true, razorpayOrderId: true },
    });
    if (order === null || order.razorpayOrderId === null) return null;

    const total = makePaise(order.total);
    if (isErr(total)) return null;

    const options = paymentService.checkoutOptions({
      razorpayOrderId: order.razorpayOrderId,
      amount: total.value,
      currency: order.currency,
      receipt: order.id,
    });
    return options.ok ? options.value : null;
  } catch {
    return null;
  }
}

/** Outcome of a client-side payment verification attempt. */
export interface VerifyResult {
  readonly verified: boolean;
  readonly status: OrderStatus | null;
}

/**
 * Verify a Razorpay checkout callback and, on success, transition the local
 * order to PAID and persist the payment ids/method (Req 8.3, 8.4, 8.7). A
 * failed verification leaves the order unpaid. Idempotent: an already-paid order
 * is treated as verified without re-transitioning.
 */
export async function verifyAndMarkPaid(callback: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  method?: string;
}): Promise<VerifyResult> {
  const details = paymentService.paymentDetailsForPaidOrder({
    razorpayOrderId: callback.razorpayOrderId,
    razorpayPaymentId: callback.razorpayPaymentId,
    razorpaySignature: callback.razorpaySignature,
    method: callback.method,
  });
  if (isErr(details)) {
    return { verified: false, status: null };
  }

  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();
    const row = await prisma.order.findFirst({
      where: { razorpayOrderId: callback.razorpayOrderId },
    });
    if (row === null) return { verified: true, status: null };

    if (row.status === 'PAID') {
      return { verified: true, status: 'PAID' };
    }

    // Enforce the lifecycle state machine (Req 10.11).
    const domainOrder = orderRowToDomain(row);
    const transitioned = transitionOrder(domainOrder, 'PAID');
    if (isErr(transitioned)) {
      return { verified: true, status: row.status as OrderStatus };
    }

    await prisma.order.update({
      where: { id: row.id },
      data: {
        status: 'PAID',
        razorpayPaymentId: details.value.razorpayPaymentId,
        razorpaySignature: details.value.razorpaySignature,
        paymentMethod: details.value.paymentMethod,
      },
    });
    // Fire the order-confirmation notification on the PAID transition (Req 18.1,
    // 10.3). Fire-and-forget: it must never block the HTTP response or throw
    // into the payment flow.
    void dispatchOrderConfirmation(row.id);
    // Route fulfillment on the PAID transition (Req 16.8). Dormant unless the
    // `pod` flag is enabled; makes no POD network call while disabled (Req 16.6).
    void dispatchFulfillmentRouting(row.id);
    return { verified: true, status: 'PAID' };
  } catch {
    return { verified: false, status: null };
  }
}

/**
 * Apply a verified Razorpay webhook to the order it references, idempotently
 * (Req 8.5, 8.6). Reads the raw body for signature verification. Returns the
 * webhook processing result; an unverified webhook makes no state change.
 */
export async function applyWebhookToOrder(
  rawBody: string,
  signature: string,
): Promise<WebhookResult> {
  // Extract the referenced Razorpay order id from the raw payload without
  // trusting it for auth — verification uses the raw body + secret.
  let razorpayOrderId: string | null = null;
  try {
    const parsed = JSON.parse(rawBody) as {
      payload?: {
        payment?: { entity?: { order_id?: string } };
        order?: { entity?: { id?: string } };
      };
    };
    razorpayOrderId =
      parsed.payload?.payment?.entity?.order_id ??
      parsed.payload?.order?.entity?.id ??
      null;
  } catch {
    razorpayOrderId = null;
  }

  // Determine current status from the DB (default PENDING when not found/down).
  let current: PaymentStatus = 'PENDING';
  let orderId: string | null = null;
  try {
    if (razorpayOrderId !== null) {
      const { getPrisma } = await import('@/lib/prisma');
      const prisma = getPrisma();
      const row = await prisma.order.findFirst({
        where: { razorpayOrderId },
        select: { id: true, status: true },
      });
      if (row !== null) {
        orderId = row.id;
        current = paymentStatusFromOrderStatus(row.status);
      }
    }
  } catch {
    // fall through with PENDING
  }

  const result = paymentService.applyWebhook(current, { rawBody, signature });

  // Persist the authoritative status only when it changed and is a real order.
  if (result.verified && result.changed && orderId !== null) {
    try {
      const { getPrisma } = await import('@/lib/prisma');
      const prisma = getPrisma();
      const data: Record<string, unknown> = {
        status: result.status === 'PAID' ? 'PAID' : 'CANCELLED',
      };
      if (result.razorpayPaymentId !== null) {
        data.razorpayPaymentId = result.razorpayPaymentId;
      }
      // Only advance to PAID via the state machine; FAILED maps to CANCELLED.
      if (result.status === 'PAID') {
        await prisma.order.update({ where: { id: orderId }, data });
        // Confirmation notification on the PAID transition (Req 18.1, 10.3).
        void dispatchOrderConfirmation(orderId);
        // Route fulfillment on the PAID transition (Req 16.8). Dormant unless
        // the `pod` flag is enabled (Req 16.6).
        void dispatchFulfillmentRouting(orderId);
      } else if (result.status === 'FAILED') {
        await prisma.order.update({
          where: { id: orderId },
          data: { razorpayPaymentId: result.razorpayPaymentId ?? undefined },
        });
      }
    } catch {
      // Ignore persistence failure; the verification result is still returned.
    }
  }

  return result;
}

/** Map the DB OrderStatus to the payment-facing PaymentStatus projection. */
function paymentStatusFromOrderStatus(status: string): PaymentStatus {
  if (status === 'PAID' || status === 'FULFILLING' || status === 'SHIPPED' || status === 'DELIVERED') {
    return 'PAID';
  }
  if (status === 'CANCELLED') return 'FAILED';
  return 'PENDING';
}

/** Build a minimal domain Order from a Prisma row for the state machine. */
function orderRowToDomain(row: {
  id: string;
  status: string;
  addressSnapshot: unknown;
  lineSnapshots: unknown;
  fulfillmentMode: string;
}): Order {
  return {
    id: row.id,
    status: row.status as OrderStatus,
    fulfillmentMode: row.fulfillmentMode === 'POD' ? 'POD' : 'SELF',
    // The state machine only reads status for a PAID transition; snapshots are
    // carried through unchanged.
    addressSnapshot: (row.addressSnapshot ?? {}) as Order['addressSnapshot'],
    lineSnapshots: (Array.isArray(row.lineSnapshots)
      ? row.lineSnapshots
      : []) as Order['lineSnapshots'],
  };
}

// Re-export Paise for callers that build amounts.
export type { Paise };
