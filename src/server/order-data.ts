/**
 * Order data-access layer — persist and load Order rows for checkout/payment.
 *
 * Bridges the pure Order_Service snapshots to the Prisma Order model. All money
 * columns are integer paise. Address and per-line price snapshots are stored as
 * JSON on the order so later edits never mutate historical orders (Req 10.4,
 * 7.7). Every function degrades gracefully when the DB is unavailable.
 */

import type { OrderTotals } from '@/services/checkout';
import type { AddressSnapshot } from '@/services/order';
import type { PricedCheckout } from './checkout-data';

/** Contact captured at guest checkout. */
export interface CheckoutContact {
  readonly email: string;
  readonly phone: string;
}

/** Input required to persist a CREATED order from a priced checkout. */
export interface CreateOrderInput {
  readonly contact: CheckoutContact;
  readonly address: AddressSnapshot;
  readonly checkout: PricedCheckout;
}

/** A per-line snapshot persisted on the order (JSON). */
interface StoredLineSnapshot {
  readonly variantId: string;
  readonly slogan: string;
  readonly color: string;
  readonly size: string;
  readonly fit: string;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly lineTotal: number;
}

/**
 * Persist a new Order in CREATED status with address + line snapshots and the
 * itemized totals (all integer paise). Returns the new order id, or null when
 * the database is unavailable.
 */
export async function createOrderForCheckout(
  input: CreateOrderInput,
): Promise<string | null> {
  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();

    const totals: OrderTotals = input.checkout.totals;
    const lineSnapshots: StoredLineSnapshot[] = input.checkout.lines.map((l) => ({
      variantId: l.variantId,
      slogan: l.slogan,
      color: l.color,
      size: l.size,
      fit: l.fit,
      unitPrice: l.unitPrice,
      quantity: l.qty,
      lineTotal: l.lineTotal,
    }));

    const order = await prisma.order.create({
      data: {
        status: 'CREATED',
        currency: 'INR',
        subtotal: totals.subtotal as number,
        discount: totals.discount as number,
        shipping: totals.shipping as number,
        tax: totals.tax as number,
        total: totals.total as number,
        addressSnapshot: input.address as unknown as object,
        lineSnapshots: lineSnapshots as unknown as object,
        fulfillmentMode: 'SELF',
      },
      select: { id: true },
    });
    return order.id;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Admin order management (task 14.2; Req 10.2, 10.5, 10.6, 10.9, 10.11)
// ---------------------------------------------------------------------------

import { transitionOrder, type Order, type OrderStatus } from '@/services/order';
import { isErr } from '@/lib/result';

/** All order statuses admins can filter by (Req 10.5). */
export const ORDER_STATUS_VALUES: readonly OrderStatus[] = [
  'CREATED',
  'PAID',
  'FULFILLING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
];

/** A single admin order row for the list / CSV export (Req 10.5, 10.6). */
export interface AdminOrderRow {
  readonly id: string;
  readonly status: string;
  readonly total: number;
  readonly createdAt: Date;
  readonly email: string | null;
  readonly phone: string | null;
  readonly trackingId: string | null;
  readonly trackingUrl: string | null;
}

/** Filter criteria for the admin order list (Req 10.5). */
export interface AdminOrderFilter {
  /** Restrict to a single status; undefined = all statuses. */
  readonly status?: OrderStatus;
  /** Inclusive lower bound on creation date. */
  readonly from?: Date;
  /** Inclusive upper bound on creation date. */
  readonly to?: Date;
}

function contactFromSnapshot(snapshot: unknown): {
  email: string | null;
  phone: string | null;
} {
  if (snapshot === null || typeof snapshot !== 'object') {
    return { email: null, phone: null };
  }
  const s = snapshot as { email?: unknown; phone?: unknown };
  return {
    email: typeof s.email === 'string' && s.email.length > 0 ? s.email : null,
    phone: typeof s.phone === 'string' && s.phone.length > 0 ? s.phone : null,
  };
}

/**
 * List orders for the admin panel, filtered by status and inclusive
 * creation-date range (Req 10.5). Returns an empty array when the database is
 * unavailable so the page renders a notice rather than crashing.
 */
export async function listOrdersForAdmin(
  filter: AdminOrderFilter = {},
): Promise<AdminOrderRow[]> {
  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();

    const where: Record<string, unknown> = {};
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.from !== undefined || filter.to !== undefined) {
      const createdAt: Record<string, Date> = {};
      if (filter.from !== undefined) createdAt.gte = filter.from;
      if (filter.to !== undefined) createdAt.lte = filter.to;
      where.createdAt = createdAt;
    }

    const rows = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        total: true,
        createdAt: true,
        addressSnapshot: true,
        trackingId: true,
        trackingUrl: true,
      },
    });

    return rows.map((o) => {
      const contact = contactFromSnapshot(o.addressSnapshot);
      return {
        id: o.id,
        status: o.status,
        total: o.total,
        createdAt: o.createdAt,
        email: contact.email,
        phone: contact.phone,
        trackingId: o.trackingId,
        trackingUrl: o.trackingUrl,
      };
    });
  } catch {
    return [];
  }
}

/** Escape a value for a CSV cell, quoting when it contains a comma/quote/newline. */
function csvCell(value: string): string {
  if (/[",\n\r]/u.test(value)) {
    return `"${value.replace(/"/gu, '""')}"`;
  }
  return value;
}

/**
 * Build a CSV of the given admin order rows: one row per order with the order
 * identifier, status, total, creation date, and customer contact (Req 10.6).
 * Total is rendered as an INR rupees string derived from integer paise.
 */
export function ordersToCsv(rows: readonly AdminOrderRow[]): string {
  const header = ['order_id', 'status', 'total_inr', 'created_at', 'email', 'phone'];
  const lines = [header.join(',')];
  for (const o of rows) {
    const rupees = `${Math.floor(o.total / 100)}.${String(o.total % 100).padStart(2, '0')}`;
    lines.push(
      [
        csvCell(o.id),
        csvCell(o.status),
        csvCell(rupees),
        csvCell(o.createdAt.toISOString()),
        csvCell(o.email ?? ''),
        csvCell(o.phone ?? ''),
      ].join(','),
    );
  }
  return lines.join('\r\n');
}

/** Result of a mark-shipped attempt (Req 10.2, 10.9, 10.11). */
export type MarkShippedResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

/**
 * Mark an order as SHIPPED with a required tracking id + URL (Req 10.2). The
 * pure {@link transitionOrder} state machine enforces that tracking is present
 * (Req 10.9) and that SHIPPED is reachable from the current status (Req 10.11);
 * on success the tracking is persisted and the shipment notification is fired
 * (Req 18.2, 17.5). Returns a message on failure, leaving status unchanged.
 */
export async function markOrderShipped(
  orderId: string,
  trackingId: string,
  trackingUrl: string,
): Promise<MarkShippedResult> {
  if (trackingId.trim().length === 0 || trackingUrl.trim().length === 0) {
    return { ok: false, message: 'A tracking identifier and tracking URL are required.' };
  }

  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();
    const row = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        addressSnapshot: true,
        lineSnapshots: true,
        fulfillmentMode: true,
      },
    });
    if (row === null) return { ok: false, message: 'Order not found.' };

    const domainOrder: Order = {
      id: row.id,
      status: row.status as OrderStatus,
      fulfillmentMode: row.fulfillmentMode === 'POD' ? 'POD' : 'SELF',
      addressSnapshot: (row.addressSnapshot ?? {}) as unknown as Order['addressSnapshot'],
      lineSnapshots: (Array.isArray(row.lineSnapshots)
        ? row.lineSnapshots
        : []) as unknown as Order['lineSnapshots'],
    };

    const transitioned = transitionOrder(domainOrder, 'SHIPPED', {
      tracking: { trackingId: trackingId.trim(), trackingUrl: trackingUrl.trim() },
    });
    if (isErr(transitioned)) {
      return { ok: false, message: transitioned.error.message };
    }

    await prisma.order.update({
      where: { id: row.id },
      data: {
        status: 'SHIPPED',
        trackingId: trackingId.trim(),
        trackingUrl: trackingUrl.trim(),
      },
    });

    // Fire the shipment notification on the SHIPPED transition (Req 18.2, 17.5).
    // Fire-and-forget so a slow/failed send never blocks the admin action.
    void (async () => {
      try {
        const { sendShipmentNotificationForOrder } = await import('./notification-data');
        await sendShipmentNotificationForOrder(row.id);
      } catch {
        // Notifications must never disturb the admin flow.
      }
    })();

    return { ok: true };
  } catch {
    return { ok: false, message: 'Database not connected — could not update the order.' };
  }
}

/** A loaded order projection used by the pay page and verify route. */
export interface LoadedOrder {
  readonly id: string;
  readonly status: string;
  readonly currency: string;
  readonly total: number;
  readonly razorpayOrderId: string | null;
  readonly addressSnapshot: unknown;
}

/** Load an order by id, or null when missing / DB unavailable. */
export async function loadOrder(orderId: string): Promise<LoadedOrder | null> {
  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        currency: true,
        total: true,
        razorpayOrderId: true,
        addressSnapshot: true,
      },
    });
    if (order === null) return null;
    return {
      id: order.id,
      status: order.status,
      currency: order.currency,
      total: order.total,
      razorpayOrderId: order.razorpayOrderId,
      addressSnapshot: order.addressSnapshot,
    };
  } catch {
    return null;
  }
}
