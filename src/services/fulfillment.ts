/**
 * Fulfillment_Provider — the print-on-demand (POD) adapter seam (Requirement 16).
 *
 * A single {@link Fulfillment_Provider} interface abstracts the five fulfillment
 * operations (Req 16.1): product creation, order creation, shipping-rate
 * retrieval, tracking retrieval, and webhook handling. Two implementations sit
 * behind it:
 * - {@link createSelfFulfillmentProvider} — the ACTIVE implementation used for
 *   in-house fulfillment (Req 16.2). It performs no external network call and
 *   simply acknowledges each operation locally.
 * - {@link createPodStubProvider} — a DORMANT stub (Req 16.3) that makes NO
 *   external network call and returns a `NOT_CONFIGURED` result for every
 *   operation until a real POD provider is wired later behind the `pod` flag.
 *
 * Keeping both behind one interface means a POD provider can be added by
 * swapping the implementation — a configuration change rather than a rewrite.
 * The routing decision (which provider handles a given order) is a pure function
 * ({@link routeFulfillment}) so it is exhaustively testable (design Property 60).
 *
 * This module is pure and effect-free: it never touches the database or network.
 * The stateful wiring (reading the flag, calling POD on the paid transition, and
 * recording the returned id / error) lives in `src/server/fulfillment-data.ts`.
 */

import type { Result } from '@/lib/result';
import { ok, err } from '@/lib/result';

// ---------------------------------------------------------------------------
// Operation inputs / outputs
// ---------------------------------------------------------------------------

/** Request to create a product (design) with the fulfillment provider. */
export interface CreateProductRequest {
  readonly productId: string;
  readonly slogan: string;
  readonly mockupUrl?: string;
}

/** Request to create a fulfillment order with the provider. */
export interface CreateOrderRequest {
  readonly orderId: string;
  readonly lines: readonly {
    readonly sku: string;
    readonly quantity: number;
    /** Provider-side variant identifier, when known (Req 16.5). */
    readonly podVariantId?: string;
  }[];
  readonly address: {
    readonly name?: string;
    readonly line1: string;
    readonly line2?: string;
    readonly city: string;
    readonly state: string;
    readonly pincode: string;
    readonly country: string;
  };
}

/** Request for a shipping-rate quote (integer paise amounts). */
export interface ShippingRateRequest {
  readonly pincode: string;
  readonly totalPaise: number;
}

/** A provider product reference returned by {@link Fulfillment_Provider.createProduct}. */
export interface ProviderProductRef {
  readonly providerProductId: string;
}

/** A provider order reference; `podOrderId` is recorded on the order (Req 16.8). */
export interface ProviderOrderRef {
  readonly podOrderId: string;
}

/** A shipping-rate quote in integer paise. */
export interface ShippingRate {
  readonly amountPaise: number;
  readonly estimatedDays?: number;
}

/** Tracking details for a fulfilled order. */
export interface TrackingDetails {
  readonly trackingId: string;
  readonly trackingUrl: string;
  readonly status: string;
}

/** The result of handling an inbound provider webhook. */
export interface WebhookHandling {
  readonly acknowledged: boolean;
  readonly detail?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Discriminated error for fulfillment operations. `NOT_CONFIGURED` is what the
 * dormant POD stub returns for every operation (Req 16.3); `PROVIDER_ERROR`
 * models a real provider failure (used on the POD-order-creation failure path,
 * Req 16.9).
 */
export type FulfillmentError =
  | { readonly kind: 'NOT_CONFIGURED'; readonly message: string }
  | { readonly kind: 'PROVIDER_ERROR'; readonly message: string };

// ---------------------------------------------------------------------------
// The adapter interface (Req 16.1)
// ---------------------------------------------------------------------------

/** Identifies which concrete provider an instance is. */
export type FulfillmentProviderKind = 'SELF' | 'POD';

/**
 * The Fulfillment_Provider adapter interface exposing the five operations
 * required by Req 16.1. Every operation returns a `Result` so callers handle
 * the not-configured / provider-error cases without exceptions.
 */
export interface Fulfillment_Provider {
  readonly kind: FulfillmentProviderKind;
  createProduct(
    req: CreateProductRequest,
  ): Promise<Result<ProviderProductRef, FulfillmentError>>;
  createOrder(
    req: CreateOrderRequest,
  ): Promise<Result<ProviderOrderRef, FulfillmentError>>;
  getShippingRate(
    req: ShippingRateRequest,
  ): Promise<Result<ShippingRate, FulfillmentError>>;
  getTracking(
    orderId: string,
  ): Promise<Result<TrackingDetails, FulfillmentError>>;
  handleWebhook(
    rawBody: string,
    signature: string,
  ): Promise<Result<WebhookHandling, FulfillmentError>>;
}

// ---------------------------------------------------------------------------
// Active self-fulfillment implementation (Req 16.2)
// ---------------------------------------------------------------------------

/**
 * The active in-house fulfillment provider (Req 16.2). It performs no external
 * network call: products/orders are handled by the store's own operations, so
 * each operation acknowledges locally. Order creation echoes a deterministic
 * `self:<orderId>` reference so the order flow has a stable, non-network id.
 */
export function createSelfFulfillmentProvider(): Fulfillment_Provider {
  return {
    kind: 'SELF',
    async createProduct(req) {
      return ok({ providerProductId: `self:${req.productId}` });
    },
    async createOrder(req) {
      // Self-fulfilled orders do not use an external POD order id; the platform
      // fulfils them in-house. A stable local reference is returned.
      return ok({ podOrderId: `self:${req.orderId}` });
    },
    async getShippingRate() {
      // Self-fulfillment defers rating to the Shipping_Service; report zero here
      // so this provider never imposes its own charge.
      return ok({ amountPaise: 0 });
    },
    async getTracking(orderId) {
      return ok({
        trackingId: `self:${orderId}`,
        trackingUrl: '',
        status: 'SELF_FULFILLED',
      });
    },
    async handleWebhook() {
      // Self-fulfillment has no external webhooks; acknowledge as a no-op.
      return ok({ acknowledged: true, detail: 'self-fulfillment: no external webhooks' });
    },
  };
}

// ---------------------------------------------------------------------------
// Dormant POD stub (Req 16.3)
// ---------------------------------------------------------------------------

const NOT_CONFIGURED_MESSAGE =
  'POD provider is not configured. Enable the pod feature flag and configure POD_API_KEY/POD_BASE_URL to activate.';

function notConfigured<T>(): Result<T, FulfillmentError> {
  return err({ kind: 'NOT_CONFIGURED', message: NOT_CONFIGURED_MESSAGE });
}

/**
 * The dormant POD stub (Req 16.3). Every operation returns `NOT_CONFIGURED`
 * WITHOUT making any external network call. This is the seam a real POD provider
 * will replace once the `pod` flag is enabled and credentials are supplied.
 */
export function createPodStubProvider(): Fulfillment_Provider {
  return {
    kind: 'POD',
    async createProduct() {
      return notConfigured<ProviderProductRef>();
    },
    async createOrder() {
      return notConfigured<ProviderOrderRef>();
    },
    async getShippingRate() {
      return notConfigured<ShippingRate>();
    },
    async getTracking() {
      return notConfigured<TrackingDetails>();
    },
    async handleWebhook() {
      return notConfigured<WebhookHandling>();
    },
  };
}

// ---------------------------------------------------------------------------
// Pure routing decision (Req 16.6, 16.7, 16.8)
// ---------------------------------------------------------------------------

/** A product's fulfillment mode (mirrors the Prisma enum). */
export type FulfillmentMode = 'SELF' | 'POD';

/** The provider a given order/product should be routed to. */
export type FulfillmentRoute = 'SELF' | 'POD';

/** Inputs to the routing decision. */
export interface FulfillmentRoutingInput {
  /** Whether the `pod` feature flag is enabled. */
  readonly podFlagEnabled: boolean;
  /** The product's fulfillment mode. */
  readonly productMode: FulfillmentMode;
}

/**
 * Decide which provider fulfils an order, purely (Req 16.6, 16.7):
 * - POD flag disabled            → SELF (all fulfillment is self, Req 16.6)
 * - POD flag enabled, mode SELF  → SELF (Req 16.7)
 * - POD flag enabled, mode POD   → POD  (Req 16.8 candidate)
 */
export function routeFulfillment(input: FulfillmentRoutingInput): FulfillmentRoute {
  if (!input.podFlagEnabled) return 'SELF';
  return input.productMode === 'POD' ? 'POD' : 'SELF';
}

/**
 * Whether a POD order should be created now for an order (Req 16.8): only when
 * routing resolves to POD, the order is paid, and it has no POD order id yet.
 */
export function shouldCreatePodOrder(input: {
  readonly route: FulfillmentRoute;
  readonly orderPaid: boolean;
  readonly existingPodOrderId: string | null | undefined;
}): boolean {
  return (
    input.route === 'POD' &&
    input.orderPaid &&
    (input.existingPodOrderId === null ||
      input.existingPodOrderId === undefined ||
      input.existingPodOrderId.length === 0)
  );
}
