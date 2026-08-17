/**
 * /checkout — server-rendered, no-JS-friendly checkout (Requirement 7).
 *
 * Collects guest contact + shipping address (name, email, 10-digit mobile,
 * address line1/line2, city, state, 6-digit pincode) in a plain HTML form bound
 * to the `submitCheckoutAction` server action. Totals are recomputed
 * server-side from the current cart via `priceGuestCheckout` (revalidating
 * stock + prices) and shown as subtotal / shipping / tax / total — all money
 * paise→INR (Req 7.3, 7.6).
 *
 * Validation errors from a prior submit are surfaced via query params, and the
 * previously entered values are retained (Req 7.1, 7.9). Degrades to a
 * "cart is empty" prompt when there is nothing to check out.
 */

import Link from 'next/link';

import { readCartSessionId } from '@/server/cart-session';
import { priceGuestCheckout } from '@/server/checkout-data';
import type { RawSearchParams } from '@/server/search-params';
import { TrackOnMount } from '@/components/TrackOnMount';
import { submitCheckoutAction } from './actions';
import { CheckoutClient } from '@/components/checkout/CheckoutClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Checkout',
};

interface CheckoutPageProps {
  searchParams: Promise<RawSearchParams>;
}

function one(raw: RawSearchParams, key: string): string {
  const v = raw[key];
  const chosen = Array.isArray(v) ? v[0] : v;
  return typeof chosen === 'string' ? chosen : '';
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const raw = await searchParams;
  const sessionId = await readCartSessionId();
  const checkout = await priceGuestCheckout(sessionId);

  if (!checkout.hasItems) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <h1 className="text-3xl font-black tracking-tight">Checkout</h1>
        <p className="text-muted">Your cart is empty, so there is nothing to check out.</p>
        <Link
          href="/shop"
          className="w-fit border border-ink px-4 py-2 text-sm font-bold uppercase tracking-wide"
        >
          Continue shopping
        </Link>
      </main>
    );
  }

  const error = one(raw, 'error');
  const invalidFields = one(raw, 'fields').split(',').filter(Boolean);
  const val = (k: string): string => one(raw, k);

  const { totals } = checkout;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      {/* Emit the begin_checkout funnel event on mount (Req 19.5). */}
      <TrackOnMount
        event="begin_checkout"
        props={{ value: totals.total as number, currency: 'INR' }}
      />
      <h1 className="text-3xl font-black tracking-tight">Checkout</h1>

      {checkout.notices.length > 0 && (
        <ul className="flex flex-col gap-1 border border-stamp-red/40 bg-stamp-red/5 p-3 text-sm text-stamp-red">
          {checkout.notices.map((n, i) => (
            <li key={`${n.kind}-${i}`}>{n.message}</li>
          ))}
        </ul>
      )}

      {error === 'server' && (
        <p role="alert" className="border border-stamp-red/40 bg-stamp-red/5 p-3 text-sm text-stamp-red">
          Something went wrong creating your order. Please try again.
        </p>
      )}

      <CheckoutClient
        checkout={checkout}
        error={error}
        invalidFields={invalidFields}
        retainedValues={val}
        submitCheckoutAction={submitCheckoutAction}
      />
    </main>
  );
}
