/**
 * Reusable Zod schemas for trust-boundary validation (Req 23.1, 23.2).
 *
 * Every API request body, form submission, and webhook payload is validated
 * against a Zod schema before any processing or persistence. On failure the
 * caller rejects the request, makes no state change, and returns field-level
 * errors (Req 23.2).
 *
 * These schemas cover the boundaries owned by task 28: the payment verify body
 * and the cart mutation forms. Admin forms are validated by the existing
 * schemas in `src/app/admin/validation.ts` (reused, not duplicated), and the
 * checkout contact shape is validated here before the domain-level
 * `validateGuestContact` runs.
 */

import { z } from 'zod';

/** Cart line quantity bound: integer 1..99 inclusive (Req 5.1, 5.2). */
export const CART_QTY_MIN = 1;
export const CART_QTY_MAX = 99;

/** A non-empty identifier string (variant id, cart line id). */
const idString = z
  .string()
  .trim()
  .min(1, 'This identifier is required.')
  .max(200, 'This identifier is too long.');

/**
 * Razorpay checkout callback body posted to `/api/payment/verify` (Req 8.3).
 * All three ids are required non-empty strings; `method` is optional metadata.
 */
export const paymentVerifySchema = z.object({
  razorpay_payment_id: z
    .string()
    .trim()
    .min(1, 'razorpay_payment_id is required.')
    .max(255),
  razorpay_order_id: z
    .string()
    .trim()
    .min(1, 'razorpay_order_id is required.')
    .max(255),
  razorpay_signature: z
    .string()
    .trim()
    .min(1, 'razorpay_signature is required.')
    .max(512),
  method: z.string().trim().max(64).optional(),
});

export type PaymentVerifyInput = z.infer<typeof paymentVerifySchema>;

/** Coerce a FormData quantity into an integer 1..99, rejecting anything else. */
const cartQty = z.coerce
  .number({ invalid_type_error: 'Quantity must be a number.' })
  .int('Quantity must be a whole number.')
  .min(CART_QTY_MIN, `Quantity must be at least ${CART_QTY_MIN}.`)
  .max(CART_QTY_MAX, `Quantity must be at most ${CART_QTY_MAX}.`);

/** Add-to-cart form: a variant id and a quantity (Req 5.1). */
export const cartAddSchema = z.object({
  variantId: idString,
  qty: cartQty,
});

export type CartAddInput = z.infer<typeof cartAddSchema>;

/** Update-cart-line form: a line id and a new quantity (Req 5.1). */
export const cartUpdateSchema = z.object({
  lineId: idString,
  qty: cartQty,
});

export type CartUpdateInput = z.infer<typeof cartUpdateSchema>;

/** Remove-cart-line form: just a line id. */
export const cartRemoveSchema = z.object({
  lineId: idString,
});

export type CartRemoveInput = z.infer<typeof cartRemoveSchema>;

/**
 * Shape validation for the guest checkout contact fields (Req 7.1). This checks
 * presence/shape only; the domain rules (email format, 10-digit mobile) remain
 * with `validateGuestContact` in the checkout service.
 */
export const checkoutContactSchema = z.object({
  email: z.string().trim().min(1, 'Email is required.').max(320),
  phone: z.string().trim().min(1, 'Phone is required.').max(20),
});

export type CheckoutContactInput = z.infer<typeof checkoutContactSchema>;

/**
 * Flatten a ZodError to a `{ field: message }` map (first error per field), for
 * returning field-level validation errors (Req 23.2). Mirrors the helper in
 * `src/app/admin/validation.ts` so both boundaries produce the same shape.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in out)) {
      out[key] = issue.message;
    }
  }
  return out;
}
