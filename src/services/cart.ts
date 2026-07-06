/**
 * Cart_Service — task 8.1 scope: cart line quantity bounds, guest/user carts,
 * merge-on-login, and checkout revalidation.
 *
 * This module implements the pure, testable slice of the Cart_Service described
 * in design.md. All logic is side-effect free and depends only on injected
 * lookups so it can be exercised without a database:
 *   - `addLine`: add a variant to a guest (session) or user cart, constraining
 *     each cart line quantity to an integer 1..99 inclusive (Req 5.1, 5.2).
 *   - `mergeGuestIntoUser`: on login, merge a guest cart into the user cart by
 *     summing the quantities of matching variants and capping each merged line
 *     at the available stock (and the 1..99 line ceiling) (Req 5.3).
 *   - `revalidateAtCheckout`: against live stock, remove zero-stock lines and
 *     reduce over-stock lines to available stock, each with a notice, and
 *     recompute line prices from current server-side variant prices
 *     (Req 5.4, 5.5, 5.8).
 *   - `isGuestCartRetained`: guest carts are retained for at least 30 days from
 *     their last update (Req 5.9).
 *
 * Wishlist behavior (task 8.3) and property tests (task 8.2) are intentionally
 * NOT implemented here.
 *
 * Persistence and live catalog data are isolated behind injected function
 * lookups (`stockOf`, `priceOf`) so the domain logic stays pure and decoupled,
 * matching the pattern used by Catalog_Service and Checkout_Service.
 */

import { type Result, ok, err } from '@/lib/result';
import { type Paise, makePaise, MONEY_MIN } from '@/lib/money';
import { type Id } from './catalog';

// ---------------------------------------------------------------------------
// Value bounds (Requirement 5)
// ---------------------------------------------------------------------------

/** Minimum quantity for a single cart line (Req 5.1, 5.2). */
export const CART_QTY_MIN = 1;

/** Maximum quantity for a single cart line (Req 5.1, 5.2). */
export const CART_QTY_MAX = 99;

/** Minimum retention window for a guest cart, in days, from last update (Req 5.9). */
export const GUEST_CART_RETENTION_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Domain types (mirroring the Prisma Cart/CartLine models)
// ---------------------------------------------------------------------------

/**
 * Identifies which cart is being operated on: a guest cart keyed by session id,
 * or a user cart keyed by user id (Req 5.1, 5.2).
 */
export type CartRef =
  | { readonly kind: 'guest'; readonly sessionId: string }
  | { readonly kind: 'user'; readonly userId: string };

/** A single cart line: a variant and its quantity (1..99). */
export interface CartLine {
  readonly variantId: Id;
  readonly qty: number;
}

/** A cart owned by a guest session or a user, with its lines and last-update time. */
export interface Cart {
  readonly ref: CartRef;
  readonly lines: readonly CartLine[];
  /** Last time the cart was modified; drives guest retention (Req 5.9). */
  readonly updatedAt: Date;
}

/** A cart line priced from current server-side variant prices at checkout (Req 5.5). */
export interface PricedCartLine {
  readonly variantId: Id;
  readonly qty: number;
  readonly unitPrice: Paise;
  readonly lineTotal: Paise;
}

/** A shopper-facing notice explaining an automatic adjustment made at checkout. */
export type CartNotice =
  | {
      readonly kind: 'LINE_REMOVED';
      readonly variantId: Id;
      readonly reason: 'OUT_OF_STOCK';
      readonly message: string;
    }
  | {
      readonly kind: 'QTY_REDUCED';
      readonly variantId: Id;
      readonly from: number;
      readonly to: number;
      readonly message: string;
    };

/** Outcome of checkout revalidation: the adjusted cart, priced lines, and notices. */
export interface RevalidationResult {
  readonly cart: Cart;
  readonly pricedLines: readonly PricedCartLine[];
  readonly notices: readonly CartNotice[];
}

/** Discriminated error type for Cart_Service operations. */
export type CartError = {
  readonly kind: 'INVALID_QTY';
  readonly message: string;
};

/** Live stock lookup for a variant; returns the available quantity (0 if unknown). */
export type StockLookup = (variantId: Id) => number;

/** Live price lookup for a variant; returns the current unit price in paise. */
export type PriceLookup = (variantId: Id) => number;

// ---------------------------------------------------------------------------
// Cart constructors
// ---------------------------------------------------------------------------

/** Create an empty guest cart identified by a session id (Req 5.1). */
export function createGuestCart(sessionId: string, now: Date = new Date()): Cart {
  return { ref: { kind: 'guest', sessionId }, lines: [], updatedAt: now };
}

/** Create an empty user cart associated with a user account (Req 5.2). */
export function createUserCart(userId: string, now: Date = new Date()): Cart {
  return { ref: { kind: 'user', userId }, lines: [], updatedAt: now };
}

// ---------------------------------------------------------------------------
// Quantity validation
// ---------------------------------------------------------------------------

/** True when `qty` is an integer within the inclusive 1..99 cart-line range. */
export function isValidLineQty(qty: number): boolean {
  return Number.isInteger(qty) && qty >= CART_QTY_MIN && qty <= CART_QTY_MAX;
}

// ---------------------------------------------------------------------------
// addLine
// ---------------------------------------------------------------------------

/**
 * Add `qty` units of `variantId` to `cart`.
 *
 * The requested quantity must be an integer from 1 to 99 inclusive; any other
 * value is rejected with `INVALID_QTY` and the cart is left unchanged (Req 5.1,
 * 5.2). When a line for the variant already exists, the quantities are summed
 * and the resulting line is clamped to the 99-unit ceiling so the per-line
 * bound always holds. The returned cart's `updatedAt` advances to `now` so
 * guest-cart retention is measured from the last modification (Req 5.9).
 */
export function addLine(
  cart: Cart,
  variantId: Id,
  qty: number,
  now: Date = new Date(),
): Result<Cart, CartError> {
  if (!isValidLineQty(qty)) {
    return err({
      kind: 'INVALID_QTY',
      message: `Cart line quantity must be an integer from ${CART_QTY_MIN} to ${CART_QTY_MAX}, received ${qty}`,
    });
  }

  const existing = cart.lines.find((line) => line.variantId === variantId);
  let nextLines: CartLine[];
  if (existing === undefined) {
    nextLines = [...cart.lines, { variantId, qty }];
  } else {
    const summed = Math.min(existing.qty + qty, CART_QTY_MAX);
    nextLines = cart.lines.map((line) =>
      line.variantId === variantId ? { variantId, qty: summed } : line,
    );
  }

  return ok({ ref: cart.ref, lines: nextLines, updatedAt: now });
}

// ---------------------------------------------------------------------------
// mergeGuestIntoUser
// ---------------------------------------------------------------------------

/**
 * Merge a guest cart into a user cart on login (Req 5.3).
 *
 * For every variant present in either cart the merged quantity is the sum of
 * the matching quantities, capped at the variant's available stock and at the
 * 99-unit per-line ceiling. Variants present in only one cart are preserved
 * (their "sum" is simply their single quantity, still capped). A merged line
 * whose capped quantity is zero — because the variant is out of stock — is
 * dropped so the cart never holds an empty line; over-stock removal with a
 * shopper notice is handled at checkout by {@link revalidateAtCheckout}.
 *
 * User-cart lines retain their original order; guest-only lines are appended in
 * their original order. The result is always a user cart.
 */
export function mergeGuestIntoUser(
  guest: Cart,
  user: Cart,
  stockOf: StockLookup,
  now: Date = new Date(),
): Cart {
  const guestQtyByVariant = new Map<Id, number>();
  for (const line of guest.lines) {
    guestQtyByVariant.set(
      line.variantId,
      (guestQtyByVariant.get(line.variantId) ?? 0) + line.qty,
    );
  }

  const seen = new Set<Id>();
  const mergedLines: CartLine[] = [];

  const capForVariant = (variantId: Id, summed: number): number => {
    const stock = Math.max(0, Math.floor(stockOf(variantId)));
    return Math.min(summed, stock, CART_QTY_MAX);
  };

  // User lines first, folding in any matching guest quantity.
  for (const line of user.lines) {
    if (seen.has(line.variantId)) continue;
    seen.add(line.variantId);
    const summed = line.qty + (guestQtyByVariant.get(line.variantId) ?? 0);
    const capped = capForVariant(line.variantId, summed);
    if (capped > 0) mergedLines.push({ variantId: line.variantId, qty: capped });
  }

  // Guest-only lines, in their original order.
  for (const line of guest.lines) {
    if (seen.has(line.variantId)) continue;
    seen.add(line.variantId);
    const summed = guestQtyByVariant.get(line.variantId) ?? line.qty;
    const capped = capForVariant(line.variantId, summed);
    if (capped > 0) mergedLines.push({ variantId: line.variantId, qty: capped });
  }

  return { ref: user.ref, lines: mergedLines, updatedAt: now };
}

// ---------------------------------------------------------------------------
// revalidateAtCheckout
// ---------------------------------------------------------------------------

/**
 * Revalidate a cart against live stock and prices at checkout (Req 5.4, 5.5, 5.8).
 *
 * For each line, using the injected live lookups:
 *   - stock == 0  → remove the line and emit a `LINE_REMOVED` notice (Req 5.8).
 *   - qty > stock > 0 → reduce the line to the available stock and emit a
 *     `QTY_REDUCED` notice (Req 5.4).
 *   - otherwise → keep the line unchanged.
 *
 * Every surviving line is priced from the current server-side variant price via
 * `priceOf`, so cart line prices are recomputed at checkout rather than trusting
 * any client-supplied or previously stored amount (Req 5.5). The returned cart's
 * `updatedAt` advances to `now`.
 */
export function revalidateAtCheckout(
  cart: Cart,
  stockOf: StockLookup,
  priceOf: PriceLookup,
  now: Date = new Date(),
): RevalidationResult {
  const survivingLines: CartLine[] = [];
  const pricedLines: PricedCartLine[] = [];
  const notices: CartNotice[] = [];

  for (const line of cart.lines) {
    const stock = Math.max(0, Math.floor(stockOf(line.variantId)));

    if (stock === 0) {
      notices.push({
        kind: 'LINE_REMOVED',
        variantId: line.variantId,
        reason: 'OUT_OF_STOCK',
        message: 'An item was removed from your cart because it is out of stock.',
      });
      continue;
    }

    let qty = line.qty;
    if (qty > stock) {
      notices.push({
        kind: 'QTY_REDUCED',
        variantId: line.variantId,
        from: qty,
        to: stock,
        message: `Quantity reduced to ${stock} because only ${stock} left in stock.`,
      });
      qty = stock;
    }

    const unitPrice = toPaiseOrZero(priceOf(line.variantId));
    const lineTotal = toPaiseOrZero((unitPrice as number) * qty);

    survivingLines.push({ variantId: line.variantId, qty });
    pricedLines.push({ variantId: line.variantId, qty, unitPrice, lineTotal });
  }

  return {
    cart: { ref: cart.ref, lines: survivingLines, updatedAt: now },
    pricedLines,
    notices,
  };
}

// ---------------------------------------------------------------------------
// Guest cart retention (Req 5.9)
// ---------------------------------------------------------------------------

/**
 * Whether a guest cart is still within its retention window.
 *
 * Guest carts are retained for at least 30 days from their last update; a cart
 * updated within the window is retained, one older than the window is eligible
 * for expiry (Req 5.9). User carts are always retained (they belong to an
 * account) and return `true`.
 */
export function isGuestCartRetained(cart: Cart, now: Date = new Date()): boolean {
  if (cart.ref.kind === 'user') return true;
  const ageMs = now.getTime() - cart.updatedAt.getTime();
  return ageMs <= GUEST_CART_RETENTION_DAYS * MS_PER_DAY;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a raw price/amount to `Paise`, falling back to 0 for any value that
 * is not a valid in-range integer. Server-side variant prices are validated by
 * Catalog_Service (integer paise 0..99,999,999), so with valid catalog data the
 * fallback is never exercised; it keeps checkout resilient and side-effect free
 * rather than throwing on unexpected input.
 */
function toPaiseOrZero(n: number): Paise {
  const result = makePaise(n);
  return result.ok ? result.value : (MONEY_MIN as Paise);
}
