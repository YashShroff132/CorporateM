/**
 * Checkout data-access + pricing orchestration.
 *
 * Bridges the persisted guest cart to the pure Checkout/Cart services:
 *   1. Load the cart lines from the DB (via `cart-data`).
 *   2. Revalidate against live stock with `cart.revalidateAtCheckout`, which
 *      also recomputes unit prices from current server-side variant prices
 *      (Req 5.4, 5.5, 5.8) and yields shopper notices for any adjustment.
 *   3. Compute shipping from config thresholds (Req 17.1) and itemized totals
 *      with `checkout.priceOrder` (Req 7.3, 7.6) — all integer paise.
 *
 * Everything degrades gracefully: an unavailable DB yields an empty priced cart
 * so checkout renders an empty state instead of crashing.
 */

import {
  revalidateAtCheckout,
  createGuestCart,
  addLine,
  type CartNotice,
} from '@/services/cart';
import {
  priceOrder,
  type OrderTotals,
  type PricedOrderLine,
} from '@/services/checkout';
import { computeShippingCharge } from '@/services/shipping';
import { applyTeamPackDiscount, type TeamPackConfig } from '@/services/growth';
import { makePaise, type Paise } from '@/lib/money';
import { config } from '@/services/config';
import { isErr } from '@/lib/result';
import { loadGuestCart, type EnrichedCartLine } from './cart-data';

/** A priced checkout line carrying the display fields plus paise amounts. */
export interface CheckoutLine {
  readonly variantId: string;
  readonly slogan: string;
  readonly color: string;
  readonly size: string;
  readonly fit: string;
  readonly qty: number;
  readonly unitPrice: number;
  readonly lineTotal: number;
}

/** The fully priced checkout state used by the checkout page + submit action. */
export interface PricedCheckout {
  readonly lines: readonly CheckoutLine[];
  readonly totals: OrderTotals;
  /** Adjustment notices produced during stock revalidation (Req 5.4, 5.8). */
  readonly notices: readonly CartNotice[];
  /** True when there is at least one purchasable line. */
  readonly hasItems: boolean;
}

const ZERO_TOTALS: OrderTotals = {
  subtotal: 0 as Paise,
  discount: 0 as Paise,
  shipping: 0 as Paise,
  tax: 0 as Paise,
  total: 0 as Paise,
};

const EMPTY_CHECKOUT: PricedCheckout = {
  lines: [],
  totals: ZERO_TOTALS,
  notices: [],
  hasItems: false,
};

/** Coerce a config integer-paise value into branded Paise (config is bounded). */
function toPaise(value: number): Paise {
  const p = makePaise(value);
  return p.ok ? p.value : (0 as Paise);
}

/**
 * Read the Owner_Input team-pack configuration from env (Req 20.3). Returns null
 * when unconfigured or invalid so the discount simply does not apply.
 */
function readTeamPackConfig(): TeamPackConfig | null {
  const minQty = Number(process.env.TEAM_PACK_MIN_QTY ?? '');
  const discount = Number(process.env.TEAM_PACK_DISCOUNT_PAISE ?? '');
  if (
    !Number.isInteger(minQty) ||
    minQty <= 0 ||
    !Number.isInteger(discount) ||
    discount <= 0
  ) {
    return null;
  }
  return { minQuantity: minQty, discount: toPaise(discount) };
}

/**
 * Load, revalidate, and price the guest cart for a session id. Returns an empty
 * priced checkout when the cart is empty or the database is unavailable.
 */
export async function priceGuestCheckout(
  sessionId: string | undefined,
): Promise<PricedCheckout> {
  if (sessionId === undefined) return EMPTY_CHECKOUT;

  const loaded = await loadGuestCart(sessionId);
  if (loaded.lines.length === 0) return EMPTY_CHECKOUT;

  // Index the enriched lines so we can re-attach display fields after pricing.
  const byVariant = new Map<string, EnrichedCartLine>(
    loaded.lines.map((l) => [l.variantId, l]),
  );

  // Build a pure Cart from the loaded lines, then revalidate against live stock
  // and current prices (Req 5.4, 5.5, 5.8).
  let cart = createGuestCart(sessionId);
  for (const line of loaded.lines) {
    const added = addLine(cart, line.variantId, line.qty);
    if (added.ok) cart = added.value;
  }

  const stockOf = (variantId: string): number =>
    byVariant.get(variantId)?.stock ?? 0;
  const priceOf = (variantId: string): number =>
    byVariant.get(variantId)?.unitPrice ?? 0;

  const revalidated = revalidateAtCheckout(cart, stockOf, priceOf);

  if (revalidated.pricedLines.length === 0) {
    return { lines: [], totals: ZERO_TOTALS, notices: revalidated.notices, hasItems: false };
  }

  const lines: CheckoutLine[] = revalidated.pricedLines.map((pl) => {
    const src = byVariant.get(pl.variantId);
    return {
      variantId: pl.variantId,
      slogan: src?.slogan ?? '',
      color: src?.color ?? '',
      size: src?.size ?? '',
      fit: src?.fit ?? '',
      qty: pl.qty,
      unitPrice: pl.unitPrice as number,
      lineTotal: pl.lineTotal as number,
    };
  });

  // Shipping from configured thresholds (Req 17.1), computed on the subtotal.
  const subtotal = revalidated.pricedLines.reduce(
    (sum, pl) => sum + (pl.lineTotal as number),
    0,
  );
  const shippingResult = computeShippingCharge(
    toPaise(subtotal),
    toPaise(config.freeShippingThreshold()),
    toPaise(config.flatShippingCharge()),
  );
  const shipping: Paise = shippingResult.ok ? shippingResult.value : (0 as Paise);

  // Price the order (subtotal/shipping/tax/total) in integer paise (Req 7.3).
  const priced: PricedOrderLine[] = revalidated.pricedLines.map((pl) => ({
    variantId: pl.variantId,
    unitPrice: pl.unitPrice,
    quantity: pl.qty,
  }));
  const totalsResult = priceOrder(priced, { shipping });
  if (isErr(totalsResult)) {
    // Pricing should not fail for valid catalog data; degrade to no totals.
    return { lines, totals: ZERO_TOTALS, notices: revalidated.notices, hasItems: true };
  }

  // Team-pack discount: applied at/above the Owner_Input minimum quantity,
  // flooring the total at 0 paise (Req 20.3). The total ordered quantity is the
  // sum of all line quantities.
  let totals = totalsResult.value;
  const teamPack = readTeamPackConfig();
  if (teamPack !== null) {
    const totalQty = revalidated.pricedLines.reduce((sum, pl) => sum + pl.qty, 0);
    const teamResult = applyTeamPackDiscount(totals.total, totalQty, teamPack);
    if (teamResult.ok && teamResult.value.applied) {
      totals = {
        ...totals,
        discount: teamResult.value.discount,
        total: teamResult.value.total,
      };
    }
  }

  return {
    lines,
    totals,
    notices: revalidated.notices,
    hasItems: true,
  };
}
