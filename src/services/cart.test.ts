import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '@/lib/result';
import {
  CART_QTY_MAX,
  GUEST_CART_RETENTION_DAYS,
  addLine,
  createGuestCart,
  createUserCart,
  isGuestCartRetained,
  isValidLineQty,
  mergeGuestIntoUser,
  revalidateAtCheckout,
  type Cart,
  type StockLookup,
} from './cart';

const AT = new Date('2026-01-01T00:00:00.000Z');

function guestCartWith(lines: { variantId: string; qty: number }[]): Cart {
  return { ref: { kind: 'guest', sessionId: 's1' }, lines, updatedAt: AT };
}

function userCartWith(lines: { variantId: string; qty: number }[]): Cart {
  return { ref: { kind: 'user', userId: 'u1' }, lines, updatedAt: AT };
}

const abundantStock: StockLookup = () => 1000;

describe('isValidLineQty (Req 5.1, 5.2)', () => {
  it.each([1, 2, 50, 99])('accepts in-range integer %d', (q) => {
    expect(isValidLineQty(q)).toBe(true);
  });

  it.each([0, -1, 100, 1.5, Number.NaN, Infinity])(
    'rejects out-of-range or non-integer %d',
    (q) => {
      expect(isValidLineQty(q)).toBe(false);
    },
  );
});

describe('addLine (Req 5.1, 5.2)', () => {
  it('adds a new line to a guest cart', () => {
    const cart = createGuestCart('s1', AT);
    const result = addLine(cart, 'v1', 3, AT);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.lines).toEqual([{ variantId: 'v1', qty: 3 }]);
      expect(result.value.ref).toEqual({ kind: 'guest', sessionId: 's1' });
    }
  });

  it('adds a line to a user cart', () => {
    const cart = createUserCart('u1', AT);
    const result = addLine(cart, 'v1', 1, AT);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.ref).toEqual({ kind: 'user', userId: 'u1' });
    }
  });

  it('sums quantities for an existing variant and caps at 99', () => {
    const cart = guestCartWith([{ variantId: 'v1', qty: 90 }]);
    const result = addLine(cart, 'v1', 20, AT);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.lines).toEqual([{ variantId: 'v1', qty: CART_QTY_MAX }]);
    }
  });

  it.each([0, -1, 100, 2.5])('rejects invalid quantity %d and leaves cart unchanged', (bad) => {
    const cart = guestCartWith([{ variantId: 'v1', qty: 2 }]);
    const result = addLine(cart, 'v1', bad, AT);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('INVALID_QTY');
    }
    // Original cart object is untouched (pure function).
    expect(cart.lines).toEqual([{ variantId: 'v1', qty: 2 }]);
  });

  it('advances updatedAt to the supplied time', () => {
    const later = new Date('2026-02-01T00:00:00.000Z');
    const result = addLine(createGuestCart('s1', AT), 'v1', 1, later);
    if (isOk(result)) {
      expect(result.value.updatedAt).toEqual(later);
    }
  });
});

describe('mergeGuestIntoUser (Req 5.3)', () => {
  it('sums matching variants and caps each at stock', () => {
    const guest = guestCartWith([
      { variantId: 'v1', qty: 4 },
      { variantId: 'v2', qty: 2 },
    ]);
    const user = userCartWith([{ variantId: 'v1', qty: 3 }]);
    const stock: StockLookup = (v) => (v === 'v1' ? 5 : 10);

    const merged = mergeGuestIntoUser(guest, user, stock, AT);

    // v1: 3 + 4 = 7 capped at stock 5; v2: guest-only 2 (stock 10).
    expect(merged.lines).toEqual([
      { variantId: 'v1', qty: 5 },
      { variantId: 'v2', qty: 2 },
    ]);
    expect(merged.ref).toEqual({ kind: 'user', userId: 'u1' });
  });

  it('caps a merged line at the 99-unit ceiling', () => {
    const guest = guestCartWith([{ variantId: 'v1', qty: 80 }]);
    const user = userCartWith([{ variantId: 'v1', qty: 80 }]);
    const merged = mergeGuestIntoUser(guest, user, abundantStock, AT);
    expect(merged.lines).toEqual([{ variantId: 'v1', qty: CART_QTY_MAX }]);
  });

  it('drops merged lines whose variant is out of stock', () => {
    const guest = guestCartWith([{ variantId: 'v1', qty: 2 }]);
    const user = userCartWith([{ variantId: 'v1', qty: 1 }]);
    const stock: StockLookup = () => 0;
    const merged = mergeGuestIntoUser(guest, user, stock, AT);
    expect(merged.lines).toEqual([]);
  });

  it('preserves non-matching lines from both carts', () => {
    const guest = guestCartWith([{ variantId: 'g', qty: 1 }]);
    const user = userCartWith([{ variantId: 'u', qty: 1 }]);
    const merged = mergeGuestIntoUser(guest, user, abundantStock, AT);
    expect(merged.lines).toEqual([
      { variantId: 'u', qty: 1 },
      { variantId: 'g', qty: 1 },
    ]);
  });

  it('handles an empty guest cart by returning the (capped) user cart', () => {
    const guest = createGuestCart('s1', AT);
    const user = userCartWith([{ variantId: 'v1', qty: 3 }]);
    const merged = mergeGuestIntoUser(guest, user, abundantStock, AT);
    expect(merged.lines).toEqual([{ variantId: 'v1', qty: 3 }]);
  });
});

describe('revalidateAtCheckout (Req 5.4, 5.5, 5.8)', () => {
  const price = (paise: number): (() => number) => (): number => paise;

  it('removes zero-stock lines with a notice (Req 5.8)', () => {
    const cart = userCartWith([{ variantId: 'v1', qty: 2 }]);
    const result = revalidateAtCheckout(cart, () => 0, price(1000), AT);
    expect(result.cart.lines).toEqual([]);
    expect(result.pricedLines).toEqual([]);
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]).toMatchObject({
      kind: 'LINE_REMOVED',
      variantId: 'v1',
      reason: 'OUT_OF_STOCK',
    });
  });

  it('reduces over-stock lines to available stock with a notice (Req 5.4)', () => {
    const cart = userCartWith([{ variantId: 'v1', qty: 10 }]);
    const result = revalidateAtCheckout(cart, () => 4, price(2500), AT);
    expect(result.cart.lines).toEqual([{ variantId: 'v1', qty: 4 }]);
    expect(result.notices[0]).toMatchObject({
      kind: 'QTY_REDUCED',
      variantId: 'v1',
      from: 10,
      to: 4,
    });
  });

  it('leaves in-stock lines unchanged and emits no notice', () => {
    const cart = userCartWith([{ variantId: 'v1', qty: 2 }]);
    const result = revalidateAtCheckout(cart, () => 5, price(1000), AT);
    expect(result.cart.lines).toEqual([{ variantId: 'v1', qty: 2 }]);
    expect(result.notices).toEqual([]);
  });

  it('recomputes line prices from current server-side prices (Req 5.5)', () => {
    const cart = userCartWith([{ variantId: 'v1', qty: 3 }]);
    const result = revalidateAtCheckout(cart, () => 10, price(1500), AT);
    expect(result.pricedLines).toEqual([
      { variantId: 'v1', qty: 3, unitPrice: 1500, lineTotal: 4500 },
    ]);
  });

  it('prices a reduced line using the reduced quantity', () => {
    const cart = userCartWith([{ variantId: 'v1', qty: 10 }]);
    const result = revalidateAtCheckout(cart, () => 2, price(1000), AT);
    expect(result.pricedLines).toEqual([
      { variantId: 'v1', qty: 2, unitPrice: 1000, lineTotal: 2000 },
    ]);
  });

  it('processes a mix of removed, reduced, and unchanged lines', () => {
    const cart = userCartWith([
      { variantId: 'gone', qty: 1 },
      { variantId: 'reduce', qty: 9 },
      { variantId: 'keep', qty: 2 },
    ]);
    const stock: StockLookup = (v) => (v === 'gone' ? 0 : v === 'reduce' ? 3 : 100);
    const result = revalidateAtCheckout(cart, stock, () => 500, AT);
    expect(result.cart.lines).toEqual([
      { variantId: 'reduce', qty: 3 },
      { variantId: 'keep', qty: 2 },
    ]);
    expect(result.notices).toHaveLength(2);
  });
});

describe('isGuestCartRetained (Req 5.9)', () => {
  const base = new Date('2026-06-01T00:00:00.000Z');

  it('retains a guest cart updated within 30 days', () => {
    const cart = createGuestCart('s1', base);
    const within = new Date(base.getTime() + 29 * 24 * 60 * 60 * 1000);
    expect(isGuestCartRetained(cart, within)).toBe(true);
  });

  it('retains a guest cart at exactly the 30-day boundary', () => {
    const cart = createGuestCart('s1', base);
    const boundary = new Date(base.getTime() + GUEST_CART_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    expect(isGuestCartRetained(cart, boundary)).toBe(true);
  });

  it('expires a guest cart older than 30 days', () => {
    const cart = createGuestCart('s1', base);
    const after = new Date(base.getTime() + 31 * 24 * 60 * 60 * 1000);
    expect(isGuestCartRetained(cart, after)).toBe(false);
  });

  it('always retains user carts', () => {
    const cart = createUserCart('u1', base);
    const farFuture = new Date(base.getTime() + 365 * 24 * 60 * 60 * 1000);
    expect(isGuestCartRetained(cart, farFuture)).toBe(true);
  });
});
