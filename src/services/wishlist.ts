/**
 * Wishlist_Service — task 8.3 scope: add/remove wishlist items for
 * authenticated users with idempotent (at most one) entries per product, and
 * guest gating that prompts sign-in.
 *
 * This module implements the pure, testable slice of the wishlist behavior
 * described in design.md and Requirement 5:
 *   - `addToWishlist`: for an authenticated user, add a product to the wishlist,
 *     storing at most one entry per (userId, productId); adding the same product
 *     again is idempotent and never creates a duplicate (Req 5.6). A guest
 *     attempting the action is rejected with `SIGN_IN_REQUIRED` so the caller
 *     can prompt the guest to sign in (Req 5.7).
 *   - `removeFromWishlist`: for an authenticated user, remove a product from the
 *     wishlist; removing an absent product is a no-op success (Req 5.6). Guests
 *     are gated identically (Req 5.7).
 *   - `getWishlist`: list an authenticated user's wishlist entries; guests are
 *     gated (Req 5.7).
 *
 * The unique (userId, productId) constraint from the Prisma `WishlistItem`
 * model is enforced here in the domain logic so idempotence holds regardless of
 * the backing store. Persistence is isolated behind an in-memory store
 * (mirroring the pattern used by Catalog_Service) so the logic stays pure and
 * unit/property testable; a Prisma-backed adapter can implement the same shape.
 *
 * This module is independent of Cart_Service (task 8.1) and does not import or
 * modify it.
 */

import { type Result, ok, err } from '@/lib/result';
import { type Id } from './catalog';

// ---------------------------------------------------------------------------
// Domain types (mirroring the Prisma WishlistItem model)
// ---------------------------------------------------------------------------

/**
 * Who is performing a wishlist action: an authenticated user identified by
 * `userId`, or an unauthenticated guest. Only authenticated users may mutate or
 * read a wishlist (Req 5.6, 5.7).
 */
export type WishlistActor =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'guest' };

/** A single wishlist entry: one product saved by one user (Req 5.6). */
export interface WishlistItem {
  readonly userId: string;
  readonly productId: Id;
  /** When the entry was first created. */
  readonly createdAt: Date;
}

/** Discriminated error type for Wishlist_Service operations. */
export type WishlistError = {
  /**
   * A guest attempted a wishlist action; the caller should prompt the guest to
   * sign in (Req 5.7).
   */
  readonly kind: 'SIGN_IN_REQUIRED';
  readonly message: string;
};

// ---------------------------------------------------------------------------
// Store abstraction (persistence isolated behind an interface)
// ---------------------------------------------------------------------------

/**
 * In-memory wishlist store. Entries are keyed by `(userId, productId)` so the
 * uniqueness constraint is structural: there can be at most one entry per
 * product per user (Req 5.6). The service reads and writes through this
 * structure so the domain logic stays pure and testable. A Prisma-backed
 * adapter can implement equivalent behavior against PostgreSQL using the
 * `@@unique([userId, productId])` index.
 */
export interface WishlistStore {
  readonly items: Map<string, WishlistItem>;
}

/** Composite key for the `(userId, productId)` uniqueness constraint. */
function wishlistKey(userId: string, productId: Id): string {
  return `${userId}\u0000${productId}`;
}

/** Create an empty in-memory wishlist store, optionally seeded with entries. */
export function createInMemoryWishlistStore(seed?: {
  items?: WishlistItem[];
}): WishlistStore {
  const store: WishlistStore = { items: new Map() };
  for (const item of seed?.items ?? []) {
    store.items.set(wishlistKey(item.userId, item.productId), item);
  }
  return store;
}

export interface WishlistServiceOptions {
  /** Injected clock for deterministic `createdAt` values in tests. */
  now?: () => Date;
}

export interface Wishlist_Service {
  /**
   * Add `productId` to the actor's wishlist. Authenticated only; idempotent so
   * repeated adds never create a duplicate entry (Req 5.6). Guests are rejected
   * with `SIGN_IN_REQUIRED` (Req 5.7). Returns the actor's full wishlist.
   */
  addToWishlist(
    actor: WishlistActor,
    productId: Id,
  ): Result<WishlistItem[], WishlistError>;
  /**
   * Remove `productId` from the actor's wishlist. Authenticated only; removing
   * an absent product is a successful no-op (Req 5.6). Guests are rejected with
   * `SIGN_IN_REQUIRED` (Req 5.7). Returns the actor's remaining wishlist.
   */
  removeFromWishlist(
    actor: WishlistActor,
    productId: Id,
  ): Result<WishlistItem[], WishlistError>;
  /**
   * List the actor's wishlist entries. Authenticated only; guests are rejected
   * with `SIGN_IN_REQUIRED` (Req 5.7).
   */
  getWishlist(actor: WishlistActor): Result<WishlistItem[], WishlistError>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SIGN_IN_MESSAGE = 'Please sign in to use your wishlist.';

/**
 * Narrow an actor to an authenticated user id, or return the guest gating
 * error so every wishlist operation shares one guard (Req 5.7).
 */
function requireUserId(actor: WishlistActor): Result<string, WishlistError> {
  if (actor.kind === 'user') return ok(actor.userId);
  return err({ kind: 'SIGN_IN_REQUIRED', message: SIGN_IN_MESSAGE });
}

/** All wishlist entries for a user, in insertion order. */
function itemsForUser(store: WishlistStore, userId: string): WishlistItem[] {
  const result: WishlistItem[] = [];
  for (const item of store.items.values()) {
    if (item.userId === userId) result.push(item);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

/**
 * Create a Wishlist_Service bound to the given store. When no store is supplied
 * a fresh in-memory store is created.
 */
export function createWishlistService(
  store: WishlistStore = createInMemoryWishlistStore(),
  options: WishlistServiceOptions = {},
): Wishlist_Service {
  const now = options.now ?? (() => new Date());

  return {
    addToWishlist(
      actor: WishlistActor,
      productId: Id,
    ): Result<WishlistItem[], WishlistError> {
      const guard = requireUserId(actor);
      if (!guard.ok) return guard;
      const userId = guard.value;

      const key = wishlistKey(userId, productId);
      // Idempotent: only insert when no entry exists for this (userId, productId),
      // so adding the same product any number of times yields at most one entry
      // and preserves the original createdAt (Req 5.6).
      if (!store.items.has(key)) {
        store.items.set(key, { userId, productId, createdAt: now() });
      }

      return ok(itemsForUser(store, userId));
    },

    removeFromWishlist(
      actor: WishlistActor,
      productId: Id,
    ): Result<WishlistItem[], WishlistError> {
      const guard = requireUserId(actor);
      if (!guard.ok) return guard;
      const userId = guard.value;

      // Removing an absent product is a no-op success (Req 5.6).
      store.items.delete(wishlistKey(userId, productId));

      return ok(itemsForUser(store, userId));
    },

    getWishlist(actor: WishlistActor): Result<WishlistItem[], WishlistError> {
      const guard = requireUserId(actor);
      if (!guard.ok) return guard;
      return ok(itemsForUser(store, guard.value));
    },
  };
}
