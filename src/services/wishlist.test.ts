import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '@/lib/result';
import {
  createInMemoryWishlistStore,
  createWishlistService,
  type WishlistActor,
} from './wishlist';

const AT = new Date('2026-01-01T00:00:00.000Z');
const USER: WishlistActor = { kind: 'user', userId: 'u1' };
const GUEST: WishlistActor = { kind: 'guest' };

function service() {
  return createWishlistService(createInMemoryWishlistStore(), { now: () => AT });
}

describe('addToWishlist (Req 5.6)', () => {
  it('adds a product for an authenticated user', () => {
    const svc = service();
    const result = svc.addToWishlist(USER, 'p1');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toMatchObject({ userId: 'u1', productId: 'p1' });
    }
  });

  it('is idempotent: adding the same product twice keeps a single entry', () => {
    const svc = service();
    svc.addToWishlist(USER, 'p1');
    const result = svc.addToWishlist(USER, 'p1');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(1);
    }
  });

  it('preserves the original createdAt when adding again', () => {
    const store = createInMemoryWishlistStore();
    let clock = new Date('2026-01-01T00:00:00.000Z');
    const svc = createWishlistService(store, { now: () => clock });
    svc.addToWishlist(USER, 'p1');
    clock = new Date('2026-02-01T00:00:00.000Z');
    svc.addToWishlist(USER, 'p1');
    const item = store.items.get('u1\u0000p1');
    expect(item?.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps distinct products as separate entries', () => {
    const svc = service();
    svc.addToWishlist(USER, 'p1');
    const result = svc.addToWishlist(USER, 'p2');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.map((i) => i.productId).sort()).toEqual(['p1', 'p2']);
    }
  });

  it('scopes entries per user', () => {
    const store = createInMemoryWishlistStore();
    const svc = createWishlistService(store, { now: () => AT });
    svc.addToWishlist({ kind: 'user', userId: 'u1' }, 'p1');
    svc.addToWishlist({ kind: 'user', userId: 'u2' }, 'p1');
    const u1 = svc.getWishlist({ kind: 'user', userId: 'u1' });
    const u2 = svc.getWishlist({ kind: 'user', userId: 'u2' });
    expect(isOk(u1) && u1.value).toHaveLength(1);
    expect(isOk(u2) && u2.value).toHaveLength(1);
  });
});

describe('removeFromWishlist (Req 5.6)', () => {
  it('removes an existing product', () => {
    const svc = service();
    svc.addToWishlist(USER, 'p1');
    const result = svc.removeFromWishlist(USER, 'p1');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('is a no-op success when the product is absent', () => {
    const svc = service();
    const result = svc.removeFromWishlist(USER, 'missing');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(0);
    }
  });
});

describe('guest gating (Req 5.7)', () => {
  it('rejects addToWishlist for a guest with SIGN_IN_REQUIRED', () => {
    const svc = service();
    const result = svc.addToWishlist(GUEST, 'p1');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('SIGN_IN_REQUIRED');
    }
  });

  it('rejects removeFromWishlist for a guest', () => {
    const svc = service();
    const result = svc.removeFromWishlist(GUEST, 'p1');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('SIGN_IN_REQUIRED');
    }
  });

  it('rejects getWishlist for a guest', () => {
    const svc = service();
    const result = svc.getWishlist(GUEST);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('SIGN_IN_REQUIRED');
    }
  });

  it('does not mutate the store on a guest action', () => {
    const store = createInMemoryWishlistStore();
    const svc = createWishlistService(store, { now: () => AT });
    svc.addToWishlist(GUEST, 'p1');
    expect(store.items.size).toBe(0);
  });
});
