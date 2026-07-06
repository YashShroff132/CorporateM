/**
 * Cart data-access layer — the only place cart routes/pages touch the database
 * for cart persistence. It maps between the Prisma Cart/CartLine models and the
 * pure Cart_Service domain, and enriches lines with product/variant display
 * data for rendering.
 *
 * Isolation mirrors `server/shop-data`: pages and actions depend on these
 * functions, not on Prisma directly, so cart rendering degrades gracefully to
 * an empty cart when the database is unavailable (missing `DATABASE_URL`,
 * connection failure) rather than throwing at build or first render.
 *
 * All money is integer paise. Unit prices are always recomputed from the
 * current server-side variant/product prices (variant `priceOverride` else
 * product `basePrice`) — never trusted from the client (Req 5.5).
 */

import { CART_QTY_MIN, CART_QTY_MAX } from '@/services/cart';

/** A cart line enriched with the display + pricing data the cart page needs. */
export interface EnrichedCartLine {
  /** CartLine row id (used for update/remove forms). */
  readonly lineId: string;
  readonly variantId: string;
  readonly qty: number;
  /** Product slogan for display (Req cart page). */
  readonly slogan: string;
  readonly productSlug: string;
  readonly color: string;
  readonly size: string;
  readonly fit: string;
  /** Current unit price in integer paise (override else base price). */
  readonly unitPrice: number;
  /** unitPrice × qty in integer paise. */
  readonly lineTotal: number;
  /** Live available stock for the variant. */
  readonly stock: number;
}

/** A fully loaded cart for display: enriched lines plus the subtotal in paise. */
export interface LoadedCart {
  readonly cartId: string | null;
  readonly lines: readonly EnrichedCartLine[];
  /** Sum of line totals in integer paise. */
  readonly subtotal: number;
}

/** An empty cart result used when nothing is stored or the DB is unavailable. */
const EMPTY_CART: LoadedCart = { cartId: null, lines: [], subtotal: 0 };

/** Clamp a raw quantity into the valid cart-line range (integer 1..99). */
function clampQty(qty: number): number {
  if (!Number.isFinite(qty)) return CART_QTY_MIN;
  const floored = Math.floor(qty);
  if (floored < CART_QTY_MIN) return CART_QTY_MIN;
  if (floored > CART_QTY_MAX) return CART_QTY_MAX;
  return floored;
}

/** Effective unit price in paise: variant override if set, else product base. */
function effectiveUnitPrice(
  priceOverride: number | null,
  basePrice: number,
): number {
  return priceOverride ?? basePrice;
}

/**
 * Load the guest cart for a session id, enriched for display. Returns an empty
 * cart when the session has no cart or the database is unavailable.
 */
export async function loadGuestCart(sessionId: string): Promise<LoadedCart> {
  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();
    const cart = await prisma.cart.findUnique({
      where: { sessionId },
      include: { lines: true },
    });
    if (cart === null || cart.lines.length === 0) {
      return { cartId: cart?.id ?? null, lines: [], subtotal: 0 };
    }

    // Batch-load the variants (with their product) for all lines.
    const variantIds = cart.lines.map((l) => l.variantId);
    const variants = await prisma.variant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });
    const variantById = new Map(variants.map((v) => [v.id, v]));

    const lines: EnrichedCartLine[] = [];
    let subtotal = 0;
    for (const line of cart.lines) {
      const variant = variantById.get(line.variantId);
      if (variant === undefined) {
        // Variant no longer exists; skip it from display.
        continue;
      }
      const unitPrice = effectiveUnitPrice(
        variant.priceOverride,
        variant.product.basePrice,
      );
      const qty = clampQty(line.qty);
      const lineTotal = unitPrice * qty;
      subtotal += lineTotal;
      lines.push({
        lineId: line.id,
        variantId: line.variantId,
        qty,
        slogan: variant.product.slogan,
        productSlug: variant.product.slug,
        color: variant.color,
        size: variant.size,
        fit: variant.fit,
        unitPrice,
        lineTotal,
        stock: variant.stock,
      });
    }

    return { cartId: cart.id, lines, subtotal };
  } catch {
    // No live DB / connection failure: degrade to an empty cart.
    return EMPTY_CART;
  }
}

/**
 * Add `qty` of a variant to the guest cart for `sessionId`, creating the cart if
 * needed. Quantities are summed with any existing line and clamped to 1..99
 * (Req 5.1). Returns true on success, false when the DB is unavailable or the
 * variant does not exist.
 */
export async function addLineToGuestCart(
  sessionId: string,
  variantId: string,
  qty: number,
): Promise<boolean> {
  const requested = clampQty(qty);
  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();

    // Reject unknown variants so we never persist an orphan line.
    const variant = await prisma.variant.findUnique({ where: { id: variantId } });
    if (variant === null) return false;

    let cart: any = await prisma.cart.findUnique({
      where: { sessionId },
      include: { lines: true },
    });
    if (cart === null) {
      const createdCart = await prisma.cart.create({
        data: { sessionId },
      });
      cart = { ...createdCart, lines: [] };
    }

    const existing = cart.lines.find((l: any) => l.variantId === variantId);
    if (existing === undefined) {
      await prisma.cartLine.create({
        data: { cartId: cart.id, variantId, qty: requested },
      });
    } else {
      const summed = clampQty(existing.qty + requested);
      await prisma.cartLine.update({
        where: { id: existing.id },
        data: { qty: summed },
      });
    }
    // Touch updatedAt so guest-cart retention is measured from last change.
    await prisma.cart.update({
      where: { id: cart.id },
      data: { updatedAt: new Date() },
    });
    return true;
  } catch (error) {
    console.error('[addLineToGuestCart] Database error:', error);
    return false;
  }
}

/**
 * Set the quantity of an existing cart line (clamped to 1..99). Verifies the
 * line belongs to the session's cart before mutating. Returns true on success.
 */
export async function updateGuestCartLineQty(
  sessionId: string,
  lineId: string,
  qty: number,
): Promise<boolean> {
  const next = clampQty(qty);
  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();
    const line = await prisma.cartLine.findUnique({
      where: { id: lineId },
      include: { cart: true },
    });
    if (line === null || line.cart.sessionId !== sessionId) return false;
    await prisma.cartLine.update({ where: { id: lineId }, data: { qty: next } });
    await prisma.cart.update({
      where: { id: line.cartId },
      data: { updatedAt: new Date() },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a cart line. Verifies the line belongs to the session's cart before
 * deleting. Returns true on success.
 */
export async function removeGuestCartLine(
  sessionId: string,
  lineId: string,
): Promise<boolean> {
  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();
    const line = await prisma.cartLine.findUnique({
      where: { id: lineId },
      include: { cart: true },
    });
    if (line === null || line.cart.sessionId !== sessionId) return false;
    await prisma.cartLine.delete({ where: { id: lineId } });
    await prisma.cart.update({
      where: { id: line.cartId },
      data: { updatedAt: new Date() },
    });
    return true;
  } catch {
    return false;
  }
}
