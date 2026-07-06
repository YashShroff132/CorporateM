/**
 * Fulfillment data-access + routing (task 22.2, Req 16.6–16.9).
 *
 * Bridges the pure {@link routeFulfillment} decision and the
 * {@link Fulfillment_Provider} adapters (self + dormant POD stub) to persisted
 * Order rows. This is the *stateful* wiring the pure `fulfillment.ts` module
 * deliberately leaves out: it reads the `pod` feature flag, decides the route,
 * and — only for a paid POD product with no POD order id yet — calls the POD
 * provider and records the returned identifier on the order (Req 16.8). On a POD
 * failure it leaves `podOrderId` unset, leaves the order PAID, and records an
 * error to the AuditLog (Req 16.9).
 *
 * DORMANT BY DEFAULT: the `pod` flag defaults OFF (Req 22.2), so every order
 * routes to self-fulfillment and NO POD network call is ever made (Req 16.6).
 * When the flag is on but a product is SELF, it still routes to self (Req 16.7).
 *
 * Everything degrades gracefully: with no DB the routing is a best-effort no-op
 * and never throws, so `next build` and the payment flow never require a live
 * database or POD credentials.
 */

import type { PrismaClient } from '@prisma/client';

import { config, type Config_Service } from '@/services/config';
import { ADMIN_ACTOR_ID } from './admin-auth';
import {
  createPodStubProvider,
  createSelfFulfillmentProvider,
  routeFulfillment,
  shouldCreatePodOrder,
  type CreateOrderRequest,
  type Fulfillment_Provider,
  type FulfillmentRoute,
} from '@/services/fulfillment';

async function client(): Promise<PrismaClient> {
  const { getPrisma } = await import('@/lib/prisma');
  return getPrisma();
}

/**
 * Resolve the POD provider implementation. Today this is always the dormant
 * stub (Req 16.3) — it makes NO network call and returns NOT_CONFIGURED. A real
 * POD provider is swapped in here once wired, a configuration change rather than
 * a rewrite. `system` reserved for a future provider that reads POD_API_KEY /
 * POD_BASE_URL from configuration.
 */
export function resolvePodProvider(): Fulfillment_Provider {
  return createPodStubProvider();
}

/** The active self-fulfillment provider (Req 16.2). */
export function resolveSelfProvider(): Fulfillment_Provider {
  return createSelfFulfillmentProvider();
}

/** Outcome of routing a single order's fulfillment. */
export interface FulfillmentRoutingResult {
  /** The provider the order was routed to. */
  readonly route: FulfillmentRoute;
  /** True when a POD order was created and its id recorded on this call. */
  readonly podOrderCreated: boolean;
  /** The recorded POD order id, when one exists. */
  readonly podOrderId: string | null;
  /** Present when POD order creation was attempted and failed (Req 16.9). */
  readonly error?: string;
}

/** Write an append-only audit row; best-effort (never throws to the caller). */
async function writeAudit(
  prisma: PrismaClient,
  actionType: string,
  entityId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: ADMIN_ACTOR_ID,
        actionType,
        entityType: 'Order',
        entityId,
        detail: detail as never,
      },
    });
  } catch {
    // Auditing is best-effort; never fail routing on a log-write error.
  }
}

/** Build the provider CreateOrderRequest from a persisted order's snapshots. */
function buildCreateOrderRequest(
  orderId: string,
  addressSnapshot: unknown,
  lineSnapshots: unknown,
): CreateOrderRequest {
  const address =
    addressSnapshot !== null && typeof addressSnapshot === 'object'
      ? (addressSnapshot as Record<string, unknown>)
      : {};
  const lines = Array.isArray(lineSnapshots)
    ? (lineSnapshots as Array<Record<string, unknown>>)
    : [];
  return {
    orderId,
    lines: lines.map((l) => ({
      sku: typeof l.sku === 'string' ? l.sku : String(l.variantId ?? ''),
      quantity:
        typeof l.quantity === 'number'
          ? l.quantity
          : typeof l.qty === 'number'
            ? (l.qty as number)
            : 1,
      podVariantId: typeof l.podVariantId === 'string' ? l.podVariantId : undefined,
    })),
    address: {
      name: typeof address.name === 'string' ? address.name : undefined,
      line1: typeof address.line1 === 'string' ? address.line1 : '',
      line2: typeof address.line2 === 'string' ? address.line2 : undefined,
      city: typeof address.city === 'string' ? address.city : '',
      state: typeof address.state === 'string' ? address.state : '',
      pincode: typeof address.pincode === 'string' ? address.pincode : '',
      country: typeof address.country === 'string' ? address.country : 'IN',
    },
  };
}

/**
 * Route a paid order's fulfillment (Req 16.6–16.9).
 *
 * Reads the `pod` flag and the order's fulfillment mode, decides the route, and
 * — only when routing resolves to POD, the order is PAID, and it has no POD
 * order id — creates the POD order through the POD provider and records the
 * returned id on the order (Req 16.8). A POD failure leaves the id unset, leaves
 * the order PAID, and records the error (Req 16.9). Self-routed orders (the
 * default, Req 16.6/16.7) make no external call.
 *
 * Best-effort: returns a SELF no-op result when the DB is unavailable.
 */
export async function routeOrderFulfillment(
  orderId: string,
  cfg: Config_Service = config,
): Promise<FulfillmentRoutingResult> {
  const podFlagEnabled = cfg.isEnabled('pod');

  let prisma: PrismaClient;
  try {
    prisma = await client();
  } catch {
    return { route: 'SELF', podOrderCreated: false, podOrderId: null };
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        fulfillmentMode: true,
        podOrderId: true,
        addressSnapshot: true,
        lineSnapshots: true,
      },
    });
    if (order === null) {
      return { route: 'SELF', podOrderCreated: false, podOrderId: null };
    }

    const productMode = order.fulfillmentMode === 'POD' ? 'POD' : 'SELF';
    const route = routeFulfillment({ podFlagEnabled, productMode });

    // Self-fulfillment (default + POD-off + SELF products): no external call
    // and nothing to record (Req 16.6, 16.7).
    if (route === 'SELF') {
      return { route, podOrderCreated: false, podOrderId: order.podOrderId };
    }

    // Route resolved to POD. Only create a POD order for a PAID order that has
    // no POD order id yet (Req 16.8).
    const orderPaid = order.status === 'PAID';
    if (
      !shouldCreatePodOrder({
        route,
        orderPaid,
        existingPodOrderId: order.podOrderId,
      })
    ) {
      return { route, podOrderCreated: false, podOrderId: order.podOrderId };
    }

    const provider = resolvePodProvider();
    const created = await provider.createOrder(
      buildCreateOrderRequest(order.id, order.addressSnapshot, order.lineSnapshots),
    );

    if (!created.ok) {
      // POD creation failed → leave podOrderId unset, leave the order PAID,
      // and record the error (Req 16.9).
      await writeAudit(prisma, 'POD_ORDER_CREATE_FAILED', order.id, {
        reason: created.error.kind,
        message: created.error.message,
      });
      return {
        route,
        podOrderCreated: false,
        podOrderId: null,
        error: created.error.message,
      };
    }

    // Success → record the returned POD order id on the order (Req 16.8).
    await prisma.order.update({
      where: { id: order.id },
      data: { podOrderId: created.value.podOrderId },
    });
    await writeAudit(prisma, 'POD_ORDER_CREATED', order.id, {
      podOrderId: created.value.podOrderId,
    });
    return {
      route,
      podOrderCreated: true,
      podOrderId: created.value.podOrderId,
    };
  } catch {
    // Any DB/provider error leaves the order untouched (stays PAID) and routing
    // is a no-op — the payment flow must never be disturbed.
    return { route: podFlagEnabled ? 'POD' : 'SELF', podOrderCreated: false, podOrderId: null };
  }
}
