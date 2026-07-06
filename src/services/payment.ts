/**
 * Payment_Service — Razorpay order creation, checkout option ordering, and
 * server-side signature verification (task 12.1 scope).
 *
 * Responsibilities implemented here (see design.md / requirements.md, Req 8):
 * - Create a Razorpay order whose `amount` equals the order total in integer
 *   paise before Razorpay Checkout is opened (Req 8.1). On failure the order is
 *   left in an unpaid state and an error is returned (Req 8.10).
 * - Present UPI as the top-ranked payment option, followed by cards,
 *   netbanking, and wallets (Req 8.2).
 * - Verify the Razorpay signature on the server before an order may be marked
 *   paid, using HMAC-SHA256 per Razorpay's checkout scheme
 *   (`HMAC(order_id | payment_id, key_secret)`). Verification failure leaves the
 *   order unpaid (Req 8.3, 8.4).
 * - Produce the payment identifiers/method to persist for a paid order —
 *   Razorpay order id, payment id, signature, and payment method (Req 8.7) —
 *   while never emitting or storing card/UPI credentials (Req 8.9).
 *
 * Webhook handling (Req 8.5, 8.6) and COD gating (Req 8.8) are implemented in
 * the task 12.2 section at the bottom of this file:
 * - Inbound Razorpay webhooks are authenticated by verifying the
 *   `X-Razorpay-Signature` HMAC-SHA256 over the raw request body using the
 *   configured webhook secret; only a verified webhook is treated as the
 *   authoritative payment status (Req 8.5). Re-applying the same verified
 *   webhook to an order whose status has already been applied is idempotent —
 *   no additional state change occurs (Req 8.6).
 * - COD is offered only when the delivery pincode is serviceable AND the order
 *   value is within the configured `min..max` inclusive (Req 8.8).
 *
 * Razorpay credentials (key id and secret) are read from configuration, which
 * sources them from environment variables only. They are never hardcoded and
 * never persisted (Req 8.9; design tenet "secrets live only in env"). The
 * Razorpay HTTP API is abstracted behind {@link RazorpayHttpClient} so the
 * logic is fully testable without live network access.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { type Result, ok, err } from '../lib/result';
import { type Paise, MONEY_MAX } from '../lib/money';
import { type Config_Service, config as defaultConfig } from './config';

// ---------------------------------------------------------------------------
// Payment method option ordering (Req 8.2)
// ---------------------------------------------------------------------------

/** A Razorpay payment method offered at checkout. */
export type PaymentMethodOption = 'upi' | 'card' | 'netbanking' | 'wallet';

/**
 * Payment options ordered exactly as required: UPI first, then cards,
 * netbanking, wallets (Req 8.2). Exposed as a frozen constant so callers cannot
 * reorder it and the ordering is a single source of truth.
 */
export const PAYMENT_METHOD_ORDER: readonly PaymentMethodOption[] = Object.freeze([
  'upi',
  'card',
  'netbanking',
  'wallet',
]);

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** The subset of an order the Payment_Service needs to initiate payment. */
export interface PayableOrder {
  readonly id: string;
  /** The order grand total in integer paise; becomes the Razorpay amount (Req 8.1). */
  readonly total: Paise;
  /** ISO 4217 currency; INR at launch. */
  readonly currency?: string;
}

/** A reference to a created Razorpay order (Req 8.1). */
export interface RazorpayOrderRef {
  /** Razorpay's order id (e.g. `order_XXXXXXXX`). */
  readonly razorpayOrderId: string;
  /** Amount in integer paise; always equals the source order total (Req 8.1). */
  readonly amount: Paise;
  /** Currency the order was created in. */
  readonly currency: string;
  /** The local order id echoed back as the receipt for reconciliation. */
  readonly receipt: string;
}

/**
 * The success payload returned by Razorpay Checkout to the client and posted to
 * the server for verification (Req 8.3). Contains identifiers and a signature
 * only — never card or UPI credentials (Req 8.9).
 */
export interface RazorpayCallback {
  readonly razorpayOrderId: string;
  readonly razorpayPaymentId: string;
  readonly razorpaySignature: string;
  /** Payment method reported by Razorpay (e.g. `upi`, `card`), if provided. */
  readonly method?: string;
}

/**
 * Payment identifiers persisted on a paid order (Req 8.7). Deliberately models
 * only non-sensitive identifiers, the signature, and the method label — there
 * is no field capable of holding card or UPI credentials (Req 8.9).
 */
export interface StoredPaymentDetails {
  readonly razorpayOrderId: string;
  readonly razorpayPaymentId: string;
  readonly razorpaySignature: string;
  readonly paymentMethod: string | null;
}

/** Checkout configuration handed to the client to open Razorpay Checkout. */
export interface RazorpayCheckoutOptions {
  readonly key: string;
  readonly amount: Paise;
  readonly currency: string;
  readonly orderId: string;
  readonly receipt: string;
  /** UPI-first ordered list of enabled payment methods (Req 8.2). */
  readonly methodOrder: readonly PaymentMethodOption[];
}

/** Discriminated error type for payment operations. */
export type PaymentError =
  | { readonly kind: 'ORDER_CREATION_FAILED'; readonly message: string }
  | { readonly kind: 'MISSING_CONFIG'; readonly message: string }
  | { readonly kind: 'INVALID_AMOUNT'; readonly message: string };

// ---------------------------------------------------------------------------
// Injectable Razorpay HTTP client
// ---------------------------------------------------------------------------

/** Request to create a Razorpay order. */
export interface CreateRazorpayOrderRequest {
  /** Amount in integer paise (Req 8.1). */
  readonly amount: number;
  readonly currency: string;
  /** Local order id used as the Razorpay receipt for reconciliation. */
  readonly receipt: string;
}

/** The fields of a created Razorpay order this service relies on. */
export interface RazorpayApiOrder {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
}

/**
 * Abstraction over Razorpay's HTTP API so the Payment_Service logic can be
 * exercised without live API calls. The production implementation performs an
 * authenticated POST to `https://api.razorpay.com/v1/orders`; tests inject a
 * fake. Implementations should reject (throw) on any non-success response so the
 * service can leave the order unpaid (Req 8.10).
 */
export interface RazorpayHttpClient {
  createOrder(req: CreateRazorpayOrderRequest): Promise<RazorpayApiOrder>;
}

// ---------------------------------------------------------------------------
// Signature verification (Req 8.3, 8.4)
// ---------------------------------------------------------------------------

/**
 * Compute the expected Razorpay checkout signature:
 * `HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)`
 * rendered as a lowercase hex digest, per Razorpay's verification scheme.
 */
export function computeCheckoutSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  keySecret: string,
): string {
  return createHmac('sha256', keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
}

/** Constant-time comparison of two hex signature strings. */
function signaturesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface Payment_Service {
  /**
   * Create a Razorpay order whose amount equals the order total in integer
   * paise (Req 8.1). Returns an error (leaving the order unpaid) when the amount
   * is invalid, credentials are missing, or the Razorpay API call fails
   * (Req 8.10).
   */
  createRazorpayOrder(
    order: PayableOrder,
  ): Promise<Result<RazorpayOrderRef, PaymentError>>;
  /**
   * Verify a Razorpay checkout callback signature on the server (Req 8.3).
   * Returns false on any mismatch so the caller leaves the order unpaid (Req 8.4).
   */
  verifySignature(payload: RazorpayCallback): boolean;
  /**
   * Build the identifiers to persist for a paid order (Req 8.7). Returns the
   * details only after the signature verifies; never includes credentials
   * (Req 8.9).
   */
  paymentDetailsForPaidOrder(
    payload: RazorpayCallback,
  ): Result<StoredPaymentDetails, PaymentError>;
  /**
   * Build the client checkout options with UPI-first method ordering (Req 8.2).
   */
  checkoutOptions(ref: RazorpayOrderRef): Result<RazorpayCheckoutOptions, PaymentError>;
  /**
   * Verify an inbound Razorpay webhook's signature over its raw body using the
   * configured webhook secret (Req 8.5). Returns false on any mismatch, empty
   * inputs, or missing secret so an unverified webhook is never treated as
   * authoritative.
   */
  verifyWebhook(webhook: RazorpayWebhook): boolean;
  /**
   * Apply a Razorpay webhook to an order's current payment status (Req 8.5, 8.6).
   *
   * Only a webhook whose signature verifies is treated as the authoritative
   * payment status (Req 8.5). Applying a verified webhook that asserts a status
   * the order has already reached produces no state change — `changed` is false —
   * so re-delivering the same webhook any number of times is idempotent
   * (Req 8.6). Unverified, malformed, or unhandled-event webhooks leave the
   * status unchanged.
   */
  applyWebhook(current: PaymentStatus, webhook: RazorpayWebhook): WebhookResult;
  /**
   * Whether COD may be offered for a delivery pincode and order value (Req 8.8).
   * COD is eligible if and only if the pincode is serviceable AND the order
   * value is within the configured `min..max` inclusive.
   */
  codEligible(pincode: string, orderValue: Paise): boolean;
}

/**
 * Default serviceability used when no {@link PincodeServiceability} is injected.
 * COD gating is a security-relevant offer decision, so the default denies COD
 * (treats every pincode as not serviceable) rather than offering it blindly;
 * callers wanting real COD gating inject the owner-configured pincode directory.
 */
const alwaysServiceable: PincodeServiceability = {
  isServiceable(): boolean {
    return false;
  },
};

/**
 * Adapt a checkout-style pincode directory (returning a location for
 * serviceable pincodes) into a {@link PincodeServiceability} for COD gating.
 */
export function serviceabilityFromDirectory(directory: {
  lookup(pincode: string): unknown;
}): PincodeServiceability {
  return {
    isServiceable(pincode: string): boolean {
      return directory.lookup(pincode) !== undefined;
    },
  };
}

/**
 * Create a Payment_Service bound to a Razorpay HTTP client and Config_Service.
 * Credentials are read lazily from config (env-backed) on each call, never
 * captured into persisted state (Req 8.9). A {@link PincodeServiceability} is
 * injected for COD gating (Req 8.8); when omitted, COD is denied by default.
 */
export function createPaymentService(
  httpClient: RazorpayHttpClient,
  cfg: Config_Service = defaultConfig,
  serviceability: PincodeServiceability = alwaysServiceable,
): Payment_Service {
  async function createRazorpayOrder(
    order: PayableOrder,
  ): Promise<Result<RazorpayOrderRef, PaymentError>> {
    const amount = order.total as number;
    // The amount must be a valid integer-paise value; anything else must not
    // reach Razorpay and leaves the order unpaid (Req 8.1, 8.10).
    if (!Number.isInteger(amount) || amount < 0 || amount > MONEY_MAX) {
      return err({
        kind: 'INVALID_AMOUNT',
        message: `Order total ${amount} is not a valid integer-paise amount`,
      });
    }

    const keyId = cfg.razorpayKeyId();
    const keySecret = cfg.razorpayKeySecret();
    if (keyId.trim().length === 0 || keySecret.trim().length === 0) {
      return err({
        kind: 'MISSING_CONFIG',
        message: 'Razorpay credentials are not configured',
      });
    }

    const currency = order.currency ?? 'INR';

    let apiOrder: RazorpayApiOrder;
    try {
      apiOrder = await httpClient.createOrder({
        amount,
        currency,
        receipt: order.id,
      });
    } catch (cause) {
      // Any failure creating the Razorpay order leaves the order unpaid (Req 8.10).
      return err({
        kind: 'ORDER_CREATION_FAILED',
        message:
          cause instanceof Error
            ? `Razorpay order creation failed: ${cause.message}`
            : 'Razorpay order creation failed',
      });
    }

    // Razorpay must echo the exact paise amount we requested (Req 8.1).
    if (apiOrder.amount !== amount) {
      return err({
        kind: 'ORDER_CREATION_FAILED',
        message: `Razorpay order amount ${apiOrder.amount} does not equal requested ${amount} paise`,
      });
    }

    return ok({
      razorpayOrderId: apiOrder.id,
      amount: order.total,
      currency: apiOrder.currency,
      receipt: order.id,
    });
  }

  function verifySignature(payload: RazorpayCallback): boolean {
    const secret = cfg.razorpayKeySecret();
    // Without a configured secret no signature can be trusted (Req 8.4).
    if (secret.trim().length === 0) return false;
    if (
      payload.razorpayOrderId.length === 0 ||
      payload.razorpayPaymentId.length === 0 ||
      payload.razorpaySignature.length === 0
    ) {
      return false;
    }
    const expected = computeCheckoutSignature(
      payload.razorpayOrderId,
      payload.razorpayPaymentId,
      secret,
    );
    return signaturesEqual(expected, payload.razorpaySignature);
  }

  function paymentDetailsForPaidOrder(
    payload: RazorpayCallback,
  ): Result<StoredPaymentDetails, PaymentError> {
    // An order may only be marked paid after server-side verification (Req 8.3, 8.4).
    if (!verifySignature(payload)) {
      return err({
        kind: 'ORDER_CREATION_FAILED',
        message: 'Payment could not be verified',
      });
    }
    return ok({
      razorpayOrderId: payload.razorpayOrderId,
      razorpayPaymentId: payload.razorpayPaymentId,
      razorpaySignature: payload.razorpaySignature,
      // Only the method label is stored — never card/UPI credentials (Req 8.9).
      paymentMethod: payload.method ?? null,
    });
  }

  function checkoutOptions(
    ref: RazorpayOrderRef,
  ): Result<RazorpayCheckoutOptions, PaymentError> {
    const keyId = cfg.razorpayKeyId();
    if (keyId.trim().length === 0) {
      return err({
        kind: 'MISSING_CONFIG',
        message: 'Razorpay key id is not configured',
      });
    }
    return ok({
      key: keyId,
      amount: ref.amount,
      currency: ref.currency,
      orderId: ref.razorpayOrderId,
      receipt: ref.receipt,
      methodOrder: PAYMENT_METHOD_ORDER,
    });
  }

  function verifyWebhook(webhook: RazorpayWebhook): boolean {
    const secret = cfg.razorpayWebhookSecret();
    // Without a configured webhook secret no webhook can be authenticated (Req 8.5).
    if (secret.trim().length === 0) return false;
    if (webhook.rawBody.length === 0 || webhook.signature.length === 0) {
      return false;
    }
    const expected = computeWebhookSignature(webhook.rawBody, secret);
    return signaturesEqual(expected, webhook.signature);
  }

  function applyWebhook(
    current: PaymentStatus,
    webhook: RazorpayWebhook,
  ): WebhookResult {
    // Only a webhook whose signature verifies is authoritative (Req 8.5). An
    // unverified webhook never changes state.
    if (!verifyWebhook(webhook)) {
      const reason: WebhookResult['reason'] =
        cfg.razorpayWebhookSecret().trim().length === 0
          ? 'MISSING_CONFIG'
          : 'INVALID_SIGNATURE';
      return {
        verified: false,
        changed: false,
        status: current,
        razorpayPaymentId: null,
        reason,
      };
    }

    const parsed = parseWebhookBody(webhook.rawBody);
    if (parsed === null) {
      return {
        verified: true,
        changed: false,
        status: current,
        razorpayPaymentId: null,
        reason: 'MALFORMED',
      };
    }

    const nextStatus = statusForEvent(parsed.event);
    if (nextStatus === null) {
      // Verified, but not an event this service acts on — no state change.
      return {
        verified: true,
        changed: false,
        status: current,
        razorpayPaymentId: parsed.razorpayPaymentId,
        reason: 'UNHANDLED_EVENT',
      };
    }

    // Re-applying a webhook that asserts the already-applied status is a no-op,
    // making duplicate deliveries idempotent (Req 8.6).
    if (nextStatus === current) {
      return {
        verified: true,
        changed: false,
        status: current,
        razorpayPaymentId: parsed.razorpayPaymentId,
      };
    }

    return {
      verified: true,
      changed: true,
      status: nextStatus,
      razorpayPaymentId: parsed.razorpayPaymentId,
    };
  }

  function codEligible(pincode: string, orderValue: Paise): boolean {
    // COD is offered only for a serviceable pincode (Req 8.8).
    if (!serviceability.isServiceable(pincode)) return false;
    const { min, max } = cfg.codLimits();
    const value = orderValue as number;
    // ...and only when the order value lies within the configured inclusive
    // min..max window (Req 8.8).
    return value >= (min as number) && value <= (max as number);
  }

  return {
    createRazorpayOrder,
    verifySignature,
    paymentDetailsForPaidOrder,
    checkoutOptions,
    verifyWebhook,
    applyWebhook,
    codEligible,
  };
}

// ===========================================================================
// Task 12.2 — idempotent webhook handling (Req 8.5, 8.6) and COD gating (Req 8.8)
// ===========================================================================

/**
 * The payment status a webhook can drive an order to. This is the payment-facing
 * projection of the order lifecycle: an order starts `PENDING` (unpaid), a
 * verified success webhook makes it `PAID`, and a verified failure webhook marks
 * it `FAILED`. Only these payment-relevant states are modeled here; the full
 * order state machine (FULFILLING/SHIPPED/…) is owned by the Order_Service.
 */
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

/**
 * A raw inbound Razorpay webhook request as received by the server: the exact
 * request body bytes (as a UTF-8 string) and the `X-Razorpay-Signature` header.
 * The signature is an HMAC-SHA256 of the raw body computed with the webhook
 * secret, so verification must run against the unmodified body string (Req 8.5).
 */
export interface RazorpayWebhook {
  /** The exact, unmodified request body received from Razorpay. */
  readonly rawBody: string;
  /** The value of the `X-Razorpay-Signature` header. */
  readonly signature: string;
}

/** Razorpay webhook event names this service acts on. */
export type RazorpayWebhookEvent =
  | 'payment.captured'
  | 'order.paid'
  | 'payment.failed';

/** The parsed, relevant shape of a Razorpay webhook payload. */
interface ParsedWebhookPayload {
  readonly event: string;
  readonly razorpayOrderId: string | null;
  readonly razorpayPaymentId: string | null;
}

/**
 * The outcome of processing a webhook. `verified` reports whether the signature
 * authenticated the webhook (Req 8.5); an unverified webhook is never applied.
 * `changed` reports whether this application actually altered the order's payment
 * status — it is `false` when the webhook is a duplicate of an already-applied
 * status, which is how idempotence is observed (Req 8.6). `status` is the
 * resulting authoritative payment status.
 */
export interface WebhookResult {
  readonly verified: boolean;
  /** True only when this application changed the payment status. */
  readonly changed: boolean;
  /** The authoritative payment status after processing. */
  readonly status: PaymentStatus;
  /** Razorpay payment id extracted from a verified webhook, when present. */
  readonly razorpayPaymentId: string | null;
  /** Reason the webhook was not applied, when `verified` is false or it was ignored. */
  readonly reason?: 'INVALID_SIGNATURE' | 'MISSING_CONFIG' | 'UNHANDLED_EVENT' | 'MALFORMED';
}

/**
 * Compute the expected Razorpay webhook signature:
 * `HMAC_SHA256(rawBody, webhookSecret)` as a lowercase hex digest, per
 * Razorpay's webhook verification scheme.
 */
export function computeWebhookSignature(rawBody: string, webhookSecret: string): string {
  return createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
}

/** Map a Razorpay webhook event name to the payment status it asserts. */
function statusForEvent(event: string): PaymentStatus | null {
  switch (event) {
    case 'payment.captured':
    case 'order.paid':
      return 'PAID';
    case 'payment.failed':
      return 'FAILED';
    default:
      return null;
  }
}

/** Parse the subset of the Razorpay webhook body this service relies on. */
function parseWebhookBody(rawBody: string): ParsedWebhookPayload | null {
  let data: unknown;
  try {
    data = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (data === null || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const event = obj.event;
  if (typeof event !== 'string' || event.length === 0) return null;

  // Razorpay nests entities under payload.<entity>.entity.{...}.
  const payload =
    obj.payload !== null && typeof obj.payload === 'object'
      ? (obj.payload as Record<string, unknown>)
      : {};
  const paymentEntity = extractEntity(payload.payment);
  const orderEntity = extractEntity(payload.order);

  const razorpayPaymentId =
    typeof paymentEntity?.id === 'string' ? paymentEntity.id : null;
  const razorpayOrderId =
    typeof paymentEntity?.order_id === 'string'
      ? paymentEntity.order_id
      : typeof orderEntity?.id === 'string'
        ? orderEntity.id
        : null;

  return { event, razorpayOrderId, razorpayPaymentId };
}

/** Pull the `.entity` object out of a Razorpay `payload.<name>` wrapper. */
function extractEntity(wrapper: unknown): Record<string, unknown> | null {
  if (wrapper === null || typeof wrapper !== 'object') return null;
  const entity = (wrapper as Record<string, unknown>).entity;
  if (entity === null || typeof entity !== 'object') return null;
  return entity as Record<string, unknown>;
}

/**
 * A serviceability check for delivery pincodes, used by COD gating (Req 8.8).
 * Implemented at launch by the owner-configured local pincode directory and
 * later replaceable by the Shipping_Service aggregator without changing callers.
 */
export interface PincodeServiceability {
  /** True when the delivery pincode is serviceable. */
  isServiceable(pincode: string): boolean;
}

/**
 * Production {@link RazorpayHttpClient} performing an authenticated POST to the
 * Razorpay Orders API. Credentials are read from config (env-backed) and used
 * only for the outbound request — never persisted (Req 8.9). Non-2xx responses
 * throw so the service leaves the order unpaid (Req 8.10).
 */
export function createRazorpayHttpClient(
  cfg: Config_Service = defaultConfig,
): RazorpayHttpClient {
  const ORDERS_ENDPOINT = 'https://api.razorpay.com/v1/orders';
  return {
    async createOrder(req: CreateRazorpayOrderRequest): Promise<RazorpayApiOrder> {
      const keyId = cfg.razorpayKeyId();
      const keySecret = cfg.razorpayKeySecret();
      if (keyId.length === 0 || keySecret.length === 0) {
        throw new Error('Razorpay credentials are not configured');
      }
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const response = await fetch(ORDERS_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: req.amount,
          currency: req.currency,
          receipt: req.receipt,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Razorpay Orders API responded with status ${response.status}`,
        );
      }
      const data = (await response.json()) as RazorpayApiOrder;
      return { id: data.id, amount: data.amount, currency: data.currency };
    },
  };
}
