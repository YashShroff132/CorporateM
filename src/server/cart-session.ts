/**
 * Guest cart session cookie helpers.
 *
 * A guest cart is keyed by an opaque `cartSessionId` stored in an httpOnly,
 * secure, sameSite=lax cookie so it cannot be read by client JS and is only
 * sent on same-site navigations (security tenet: cart cookie hardening). The
 * cookie value is a random, unguessable id; it never contains cart contents.
 *
 * These helpers wrap Next.js `cookies()` (async in Next 15) and are only ever
 * called from Server Components, Server Actions, or Route Handlers.
 */

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

/** Cookie name holding the guest cart session id. */
export const CART_SESSION_COOKIE = 'cartSessionId';

/** Cookie lifetime — align with the 30-day guest cart retention (Req 5.9). */
const CART_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Options applied when writing the cart session cookie. */
function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ('none' as const) : ('lax' as const),
    path: '/',
    maxAge: CART_COOKIE_MAX_AGE_SECONDS,
  };
}

/**
 * Read the current guest cart session id from the request cookies, or
 * `undefined` when none is set yet. Does not create one (read-only, safe to
 * call from Server Components during render).
 */
export async function readCartSessionId(): Promise<string | undefined> {
  const store = await cookies();
  const value = store.get(CART_SESSION_COOKIE)?.value;
  return value !== undefined && value.length > 0 ? value : undefined;
}

/**
 * Get the guest cart session id, creating and persisting a new one when absent.
 * Must be called from a Server Action or Route Handler (it writes a cookie).
 */
export async function ensureCartSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(CART_SESSION_COOKIE)?.value;
  if (existing !== undefined && existing.length > 0) {
    return existing;
  }
  const sessionId = randomUUID();
  store.set(CART_SESSION_COOKIE, sessionId, cookieOptions());
  return sessionId;
}
