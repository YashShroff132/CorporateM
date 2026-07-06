'use server';

/**
 * Cart server actions — mutate the guest cart then revalidate the cart page.
 *
 * These are invoked by no-JS HTML forms (the PDP add-to-cart POST and the cart
 * page update/remove forms), so each accepts `FormData`, performs the mutation
 * through the isolated `cart-data` layer, and redirects back to `/cart`. The
 * guest cart is keyed by the httpOnly `cartSessionId` cookie, created on demand.
 *
 * Task 28 hardening: each action validates its FormData against a Zod schema
 * before any mutation/persistence (Req 23.1, 23.2). Invalid input (missing id,
 * out-of-range quantity) makes no change and redirects back to /cart with an
 * error marker so the no-JS form can surface it. CSRF is enforced by the root
 * middleware's same-origin check plus Next's built-in Server Action origin
 * validation (Req 23.6).
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { ensureCartSessionId } from '@/server/cart-session';
import {
  addLineToGuestCart,
  removeGuestCartLine,
  updateGuestCartLineQty,
} from '@/server/cart-data';
import {
  cartAddSchema,
  cartRemoveSchema,
  cartUpdateSchema,
  fieldErrors,
} from '@/server/security/schemas';

/** Redirect back to /cart, optionally with the first invalid field marked. */
function backToCart(fields?: Record<string, string>): never {
  if (fields === undefined) redirect('/cart');
  const first = Object.keys(fields)[0] ?? 'form';
  const qs = new URLSearchParams({ error: 'invalid', field: first }).toString();
  redirect(`/cart?${qs}`);
}

/**
 * Add a variant to the cart (from the PDP POST: variantId + optional qty).
 * Creates the guest cart session cookie if missing, then redirects to /cart.
 */
export async function addToCartAction(formData: FormData): Promise<void> {
  const parsed = cartAddSchema.safeParse({
    variantId: formData.get('variantId'),
    // Default missing quantity to 1 (the PDP omits qty for a single add).
    qty: formData.get('qty') ?? 1,
  });
  if (!parsed.success) {
    backToCart(fieldErrors(parsed.error));
  }
  const sessionId = await ensureCartSessionId();
  await addLineToGuestCart(sessionId, parsed.data.variantId, parsed.data.qty);
  revalidatePath('/cart');
  redirect('/cart');
}

/** Update the quantity of a cart line, then revalidate and return to /cart. */
export async function updateCartLineAction(formData: FormData): Promise<void> {
  const parsed = cartUpdateSchema.safeParse({
    lineId: formData.get('lineId'),
    qty: formData.get('qty'),
  });
  if (!parsed.success) {
    backToCart(fieldErrors(parsed.error));
  }
  const sessionId = await ensureCartSessionId();
  await updateGuestCartLineQty(sessionId, parsed.data.lineId, parsed.data.qty);
  revalidatePath('/cart');
  redirect('/cart');
}

/** Remove a cart line, then revalidate and return to /cart. */
export async function removeCartLineAction(formData: FormData): Promise<void> {
  const parsed = cartRemoveSchema.safeParse({
    lineId: formData.get('lineId'),
  });
  if (!parsed.success) {
    backToCart(fieldErrors(parsed.error));
  }
  const sessionId = await ensureCartSessionId();
  await removeGuestCartLine(sessionId, parsed.data.lineId);
  revalidatePath('/cart');
  redirect('/cart');
}
