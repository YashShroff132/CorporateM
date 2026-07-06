/**
 * Order_Service — order lifecycle state machine and transitions.
 *
 * This module owns the order status state machine and the pure transition
 * logic of Requirement 10 (task 14.1 scope):
 * - Represent each order with a status from the set {CREATED, PAID,
 *   FULFILLING, SHIPPED, DELIVERED, CANCELLED, REFUNDED} (Req 10.1).
 * - Enforce the allowed transition set; a transition that is not permitted from
 *   the order's current status is rejected and the status is left unchanged
 *   (Req 10.11).
 * - Transition to SHIPPED only from PAID or FULFILLING and only when a
 *   non-empty tracking identifier and tracking URL are supplied, recording the
 *   tracking information on the order (Req 10.2). A ship attempt without
 *   tracking is rejected and the status is left unchanged (Req 10.9).
 * - Transition to REFUNDED only when the payment gateway refund succeeds; a
 *   failed refund leaves the status unchanged (Req 10.7, 10.10).
 * - Store an address snapshot and per-item price snapshots on each order
 *   (Req 10.4).
 * - Associate each order with a fulfillment mode from {SELF, POD}, defaulting
 *   to SELF (Req 10.8).
 *
 * Fulfillment routing (Req 16 / task 22.2) and admin filtering + CSV export
 * (Req 10.5, 10.6 / task 14.2) are intentionally NOT implemented here.
 *
 * The transition function is pure: the actual Razorpay refund call lives in the
 * Payment_Service, and its result is passed in via {@link TransitionCtx} so the
 * state machine can be unit- and property-tested without any I/O.
 */

import { type Result, ok, err } from '../lib/result';
import { type Paise } from '../lib/money';

// ---------------------------------------------------------------------------
// Domain types (mirroring the Prisma Order model in prisma/schema.prisma)
// ---------------------------------------------------------------------------

/** Order lifecycle status (Req 10.1). */
export type OrderStatus =
  | 'CREATED'
  | 'PAID'
  | 'FULFILLING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

/** All order statuses in a stable order (Req 10.1). */
export const ORDER_STATUSES: readonly OrderStatus[] = [
  'CREATED',
  'PAID',
  'FULFILLING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
];

/** Fulfillment routing mode (Req 10.8). */
export type FulfillmentMode = 'SELF' | 'POD';

/** All fulfillment modes; SELF is the default (Req 10.8). */
export const FULFILLMENT_MODES: readonly FulfillmentMode[] = ['SELF', 'POD'];

/**
 * The allowed status transitions, keyed by current status (Req 10.11).
 * Mirrors the state diagram in design.md:
 *   CREATED   -> PAID, CANCELLED
 *   PAID      -> FULFILLING, SHIPPED, REFUNDED, CANCELLED
 *   FULFILLING-> SHIPPED, CANCELLED
 *   SHIPPED   -> DELIVERED, REFUNDED
 *   DELIVERED -> REFUNDED
 *   CANCELLED -> (terminal)
 *   REFUNDED  -> (terminal)
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> =
  Object.freeze({
    CREATED: ['PAID', 'CANCELLED'],
    PAID: ['FULFILLING', 'SHIPPED', 'REFUNDED', 'CANCELLED'],
    FULFILLING: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED', 'REFUNDED'],
    DELIVERED: ['REFUNDED'],
    CANCELLED: [],
    REFUNDED: [],
  } as const);

/**
 * Address snapshot captured on the order at checkout so later address edits do
 * not mutate historical orders (Req 10.4). Stored as JSON on the order.
 */
export interface AddressSnapshot {
  readonly name: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
  readonly phone: string;
  readonly email?: string;
}

/**
 * Per-item price snapshot captured on the order (Req 10.4, 7.7). Prices are the
 * integer-paise values at the time the order was created and never change.
 */
export interface OrderLineSnapshot {
  readonly variantId: string;
  readonly sku: string;
  readonly color: string;
  readonly size: string;
  readonly fit: string;
  /** Unit price in integer paise at order time. */
  readonly unitPrice: Paise;
  /** Line quantity (1..99, validated by the Cart_Service). */
  readonly quantity: number;
  /** Line total in integer paise (unitPrice × quantity) at order time. */
  readonly lineTotal: Paise;
}

/** The order as far as the state machine is concerned. */
export interface Order {
  readonly id: string;
  readonly status: OrderStatus;
  /** Fulfillment mode, defaulting to SELF (Req 10.8). */
  readonly fulfillmentMode: FulfillmentMode;
  /** Address snapshot captured at checkout (Req 10.4). */
  readonly addressSnapshot: AddressSnapshot;
  /** Per-item price snapshots captured at checkout (Req 10.4). */
  readonly lineSnapshots: readonly OrderLineSnapshot[];
  /** Tracking identifier, recorded when the order ships (Req 10.2). */
  readonly trackingId?: string | null;
  /** Tracking URL, recorded when the order ships (Req 10.2). */
  readonly trackingUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Transition context and errors
// ---------------------------------------------------------------------------

/** Tracking information required to ship an order (Req 10.2). */
export interface TrackingInfo {
  readonly trackingId: string;
  readonly trackingUrl: string;
}

/**
 * The outcome of a payment-gateway refund request performed by the
 * Payment_Service (Req 10.7). The state machine transitions to REFUNDED only
 * when `success` is true.
 */
export interface RefundOutcome {
  readonly success: boolean;
  /** Optional gateway detail (e.g. failure reason) for surfacing to the admin. */
  readonly detail?: string;
}

/**
 * Context supplied alongside a requested transition. Carries the tracking
 * information for a SHIPPED transition and the gateway refund outcome for a
 * REFUNDED transition, keeping {@link transitionOrder} pure.
 */
export interface TransitionCtx {
  readonly tracking?: TrackingInfo;
  readonly refundOutcome?: RefundOutcome;
}

/** Discriminated error describing why an order transition was rejected. */
export type OrderError =
  | { readonly kind: 'INVALID_STATUS'; readonly message: string }
  | { readonly kind: 'TRANSITION_NOT_ALLOWED'; readonly message: string }
  | { readonly kind: 'TRACKING_REQUIRED'; readonly message: string }
  | { readonly kind: 'REFUND_FAILED'; readonly message: string }
  | { readonly kind: 'MISSING_SNAPSHOT'; readonly message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when `next` is a permitted transition from `current` (Req 10.11). */
export function isTransitionAllowed(current: OrderStatus, next: OrderStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[current];
  return allowed !== undefined && allowed.includes(next);
}

function isNonEmpty(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Order creation (snapshots + default fulfillment mode)
// ---------------------------------------------------------------------------

/** Input for creating a new order; captures the snapshots taken at checkout. */
export interface CreateOrderInput {
  readonly id: string;
  readonly addressSnapshot: AddressSnapshot;
  readonly lineSnapshots: readonly OrderLineSnapshot[];
  /** Fulfillment mode; defaults to SELF when omitted (Req 10.8). */
  readonly fulfillmentMode?: FulfillmentMode;
}

/**
 * Create a new order in the initial CREATED status, storing the address
 * snapshot and per-item price snapshots (Req 10.4) and defaulting the
 * fulfillment mode to SELF (Req 10.8). The snapshots must be present so the
 * order carries an immutable record of what was purchased and where it ships.
 */
export function createOrder(input: CreateOrderInput): Result<Order, OrderError> {
  if (input.lineSnapshots.length === 0) {
    return err({
      kind: 'MISSING_SNAPSHOT',
      message: 'An order must have at least one line snapshot',
    });
  }
  const fulfillmentMode = input.fulfillmentMode ?? 'SELF';
  if (!FULFILLMENT_MODES.includes(fulfillmentMode)) {
    return err({
      kind: 'INVALID_STATUS',
      message: `Fulfillment mode must be one of ${FULFILLMENT_MODES.join(', ')}, received ${String(fulfillmentMode)}`,
    });
  }
  return ok({
    id: input.id,
    status: 'CREATED',
    fulfillmentMode,
    addressSnapshot: input.addressSnapshot,
    lineSnapshots: input.lineSnapshots,
    trackingId: null,
    trackingUrl: null,
  });
}

// ---------------------------------------------------------------------------
// Transition function (pure state machine)
// ---------------------------------------------------------------------------

/**
 * Attempt to transition an order to `next`, returning a new Order value on
 * success and leaving the input order unchanged on failure (the function never
 * mutates its argument).
 *
 * Rules enforced (Req 10.2, 10.7, 10.9, 10.10, 10.11):
 * - `next` must be a known status, otherwise INVALID_STATUS.
 * - `next` must be permitted from the current status, otherwise
 *   TRANSITION_NOT_ALLOWED (Req 10.11).
 * - A SHIPPED transition requires a non-empty tracking id and URL; the tracking
 *   is recorded on the returned order. The allowed set already restricts the
 *   source status to PAID or FULFILLING (Req 10.2). Missing tracking yields
 *   TRACKING_REQUIRED with the status unchanged (Req 10.9).
 * - A REFUNDED transition requires a successful gateway refund outcome;
 *   otherwise REFUND_FAILED with the status unchanged (Req 10.7, 10.10).
 */
export function transitionOrder(
  order: Order,
  next: OrderStatus,
  ctx: TransitionCtx = {},
): Result<Order, OrderError> {
  // The target must be a recognized status (Req 10.1).
  if (!ORDER_STATUSES.includes(next)) {
    return err({
      kind: 'INVALID_STATUS',
      message: `Status must be one of ${ORDER_STATUSES.join(', ')}, received ${String(next)}`,
    });
  }

  // The target must be reachable from the current status (Req 10.11).
  if (!isTransitionAllowed(order.status, next)) {
    return err({
      kind: 'TRANSITION_NOT_ALLOWED',
      message: `Cannot transition order ${order.id} from ${order.status} to ${next}`,
    });
  }

  // Shipping requires non-empty tracking; record it on the order (Req 10.2, 10.9).
  if (next === 'SHIPPED') {
    const tracking = ctx.tracking;
    if (
      tracking === undefined ||
      !isNonEmpty(tracking.trackingId) ||
      !isNonEmpty(tracking.trackingUrl)
    ) {
      return err({
        kind: 'TRACKING_REQUIRED',
        message: 'A tracking identifier and tracking URL are required to mark an order shipped',
      });
    }
    return ok({
      ...order,
      status: 'SHIPPED',
      trackingId: tracking.trackingId,
      trackingUrl: tracking.trackingUrl,
    });
  }

  // Refunds only complete on gateway success (Req 10.7, 10.10).
  if (next === 'REFUNDED') {
    const outcome = ctx.refundOutcome;
    if (outcome === undefined || !outcome.success) {
      return err({
        kind: 'REFUND_FAILED',
        message:
          outcome?.detail !== undefined
            ? `Refund could not be completed: ${outcome.detail}`
            : 'Refund could not be completed',
      });
    }
    return ok({ ...order, status: 'REFUNDED' });
  }

  return ok({ ...order, status: next });
}

// ---------------------------------------------------------------------------
// Service facade
// ---------------------------------------------------------------------------

export interface Order_Service {
  /** Create an order in CREATED status with snapshots (Req 10.4, 10.8). */
  createOrder(input: CreateOrderInput): Result<Order, OrderError>;
  /** Transition an order through the lifecycle state machine (Req 10.2, 10.7–10.11). */
  transition(
    order: Order,
    next: OrderStatus,
    ctx?: TransitionCtx,
  ): Result<Order, OrderError>;
  /** Report whether a transition is permitted from a given status (Req 10.11). */
  isTransitionAllowed(current: OrderStatus, next: OrderStatus): boolean;
}

/** Create an Order_Service exposing the pure state-machine operations. */
export function createOrderService(): Order_Service {
  return {
    createOrder,
    transition: transitionOrder,
    isTransitionAllowed,
  };
}

/** Default Order_Service instance. */
export const orderService: Order_Service = createOrderService();
