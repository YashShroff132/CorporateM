'use server';

/**
 * Checkout submit server action.
 *
 * On submit of the no-JS checkout form this:
 *   1. Validates the guest contact (email + 10-digit mobile) via
 *      `checkout.validateGuestContact` and the pincode via `autofillPincode`
 *      against the seeded serviceable directory (Req 7.1, 7.2, 7.9, 7.10).
 *   2. Re-prices the current cart server-side (never trusts client amounts).
 *   3. Persists an Order row (status CREATED) with address + line price
 *      snapshots (Req 10.4, 7.7).
 *   4. Creates a Razorpay order for the exact total in paise (Req 8.1) and
 *      redirects to the hosted-checkout pay page. If Razorpay keys are missing
 *      the order is still created and the pay page renders a "not configured"
 *      message rather than crashing.
 *
 * On validation failure it redirects back to /checkout with error query params
 * so the SSR form can re-render with messages and retain entered values.
 *
 * Task 28 hardening: contact inputs are shape-validated against a Zod schema
 * before the domain-level `validateGuestContact` runs (Req 23.1, 23.2). CSRF is
 * enforced by the root middleware same-origin check plus Next's built-in Server
 * Action origin validation (Req 23.6).
 */

import { redirect } from 'next/navigation';

import { validateGuestContact, autofillPincode } from '@/services/checkout';
import { isErr } from '@/lib/result';
import { readCartSessionId } from '@/server/cart-session';
import { pincodeDirectory } from '@/server/pincode-directory';
import { priceGuestCheckout } from '@/server/checkout-data';
import { createOrderForCheckout } from '@/server/order-data';
import { createRazorpayOrderForOrder } from '@/server/payment-data';
import { checkoutContactSchema } from '@/server/security/schemas';

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

/** Build a querystring for redirecting back with errors + retained fields. */
function backToCheckout(params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  redirect(`/checkout?${qs}`);
}

export async function submitCheckoutAction(formData: FormData): Promise<void> {
  const name = s(formData, 'name');
  const email = s(formData, 'email');
  const phone = s(formData, 'phone');
  const line1 = s(formData, 'line1');
  const line2 = s(formData, 'line2');
  const city = s(formData, 'city');
  const state = s(formData, 'state');
  const pincode = s(formData, 'pincode');

  // Retain entered values on any redirect back to the form.
  const retained: Record<string, string> = {
    name,
    email,
    phone,
    line1,
    line2,
    city,
    state,
    pincode,
  };

  // Shape-validate contact fields against the Zod schema before any domain
  // processing (Req 23.1, 23.2). Presence failures come back as a contact error.
  const shape = checkoutContactSchema.safeParse({ email, phone });
  if (!shape.success) {
    const fields = Object.keys(shape.error.flatten().fieldErrors).join(',');
    backToCheckout({ ...retained, error: 'contact', fields });
  }

  // Validate contact details (Req 7.1, 7.9).
  const contact = validateGuestContact({ email, phone });
  if (isErr(contact)) {
    const fields =
      contact.error.kind === 'INVALID_CONTACT' ? contact.error.fields.join(',') : '';
    backToCheckout({ ...retained, error: 'contact', fields });
  }

  // Basic presence checks for the remaining address fields.
  if (name.length === 0 || line1.length === 0) {
    backToCheckout({ ...retained, error: 'address' });
  }

  // Validate + resolve the pincode against the serviceable directory (Req 7.2, 7.10).
  const location = autofillPincode(pincode, pincodeDirectory);
  if (isErr(location)) {
    backToCheckout({ ...retained, error: 'pincode' });
  }

  // Re-price the cart server-side (Req 5.5, 7.6).
  const sessionId = await readCartSessionId();
  const checkout = await priceGuestCheckout(sessionId);
  if (!checkout.hasItems) {
    redirect('/cart');
  }

  // Persist the order (CREATED) with snapshots (Req 10.4, 7.7).
  const resolvedCity = location.ok ? location.value.city : city;
  const resolvedState = location.ok ? location.value.state : state;
  const orderId = await createOrderForCheckout({
    contact: contact.ok ? contact.value : { email, phone },
    address: {
      name,
      line1,
      line2: line2.length > 0 ? line2 : undefined,
      city: resolvedCity,
      state: resolvedState,
      pincode,
      phone,
      email,
    },
    checkout,
  });

  if (orderId === null) {
    // DB unavailable — cannot create an order; send back with a generic error.
    backToCheckout({ ...retained, error: 'server' });
  }

  // Create the Razorpay order (best-effort). Missing keys or API failure are
  // handled on the pay page which reads the order's razorpayOrderId.
  await createRazorpayOrderForOrder(orderId as string);

  redirect(`/checkout/pay/${orderId as string}`);
}
