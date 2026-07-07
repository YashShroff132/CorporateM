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

import { toINRString, makePaise } from '@/lib/money';
import { readCartSessionId } from '@/server/cart-session';
import { priceGuestCheckout } from '@/server/checkout-data';
import { SEED_PINCODES } from '@/server/pincode-directory';
import type { RawSearchParams } from '@/server/search-params';
import { TrackOnMount } from '@/components/TrackOnMount';
import { submitCheckoutAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Checkout',
};

interface CheckoutPageProps {
  searchParams: Promise<RawSearchParams>;
}

function inr(paise: number): string {
  const validated = makePaise(paise);
  return `₹${validated.ok ? toINRString(validated.value) : '0.00'}`;
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
  const isInvalid = (f: string): boolean => invalidFields.includes(f);

  const { totals } = checkout;
  // Sample serviceable pincodes to guide the shopper (launch directory).
  const samplePincodes = Object.keys(SEED_PINCODES).slice(0, 5).join(', ');

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

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Contact + address form (no-JS). */}
        <form action={submitCheckoutAction} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-3">
            <legend className="text-lg font-bold">Contact</legend>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold uppercase tracking-wide">Full name</span>
              <input
                name="name"
                required
                defaultValue={val('name')}
                className="border border-ink/20 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold uppercase tracking-wide">Email</span>
              <input
                name="email"
                type="email"
                required
                defaultValue={val('email')}
                aria-invalid={isInvalid('email')}
                className="border border-ink/20 px-3 py-2"
              />
              {isInvalid('email') && (
                <span className="text-xs text-stamp-red">Enter a valid email address.</span>
              )}
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold uppercase tracking-wide">Mobile (10 digits)</span>
              <input
                name="phone"
                inputMode="numeric"
                pattern="[6-9][0-9]{9}"
                required
                defaultValue={val('phone')}
                aria-invalid={isInvalid('phone')}
                className="border border-ink/20 px-3 py-2"
              />
              {isInvalid('phone') && (
                <span className="text-xs text-stamp-red">
                  Enter a valid 10-digit Indian mobile number.
                </span>
              )}
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-lg font-bold">Shipping address</legend>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold uppercase tracking-wide">Address line 1</span>
              <input
                name="line1"
                required
                defaultValue={val('line1')}
                className="border border-ink/20 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold uppercase tracking-wide">Address line 2</span>
              <input
                name="line2"
                defaultValue={val('line2')}
                className="border border-ink/20 px-3 py-2"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-bold uppercase tracking-wide">City</span>
                <input
                  name="city"
                  defaultValue={val('city')}
                  className="border border-ink/20 px-3 py-2"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-bold uppercase tracking-wide">State</span>
                <input
                  name="state"
                  defaultValue={val('state')}
                  className="border border-ink/20 px-3 py-2"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold uppercase tracking-wide">Pincode (6 digits)</span>
              <input
                name="pincode"
                inputMode="numeric"
                pattern="[1-9][0-9]{5}"
                required
                defaultValue={val('pincode')}
                aria-invalid={error === 'pincode'}
                className="border border-ink/20 px-3 py-2"
              />
              {error === 'pincode' && (
                <span className="text-xs text-stamp-red">
                  This pincode is not recognized or not serviceable.
                </span>
              )}
              <span className="text-xs text-muted">
                Serviceable examples: {samplePincodes}
              </span>
            </label>

            {error === 'address' && (
              <p role="alert" className="text-xs text-stamp-red">
                Please provide your name and address line 1.
              </p>
            )}
          </fieldset>

          <button
            type="submit"
            className="bg-highlighter px-6 py-3 text-sm font-black uppercase tracking-wide text-ink"
          >
            Continue to payment
          </button>
        </form>

        {/* Order summary. */}
        <section aria-label="Order summary" className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">Order summary</h2>
          <ul className="flex flex-col divide-y divide-ink/10 border-y border-ink/10">
            {checkout.lines.map((line) => (
              <li key={line.variantId} className="flex flex-col gap-1 py-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold">{line.slogan}</span>
                  <span>{inr(line.lineTotal)}</span>
                </div>
                <span className="text-muted">
                  {line.color} · {line.size} · {line.fit} · Qty {line.qty}
                </span>
              </li>
            ))}
          </ul>

          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{inr(totals.subtotal as number)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Shipping</dt>
              <dd>{inr(totals.shipping as number)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Tax (GST)</dt>
              <dd>{inr(totals.tax as number)}</dd>
            </div>
            {(totals.discount as number) > 0 && (
              <div className="flex justify-between">
                <dt>Discount</dt>
                <dd>-{inr(totals.discount as number)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-ink pt-2 text-base font-black">
              <dt>Total</dt>
              <dd>{inr(totals.total as number)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
