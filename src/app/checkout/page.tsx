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
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      {/* Emit the begin_checkout funnel event on mount (Req 19.5). */}
      <TrackOnMount
        event="begin_checkout"
        props={{ value: totals.total as number, currency: 'INR' }}
      />
      
      {/* JIRA / Linear issue-style header block */}
      <div className="border-b border-ink/20 pb-4">
        <div className="text-xs font-mono uppercase tracking-widest text-ink/50 flex items-center gap-2 mb-2">
          <span>Project: Corporate Cult</span>
          <span>/</span>
          <span className="bg-ink/5 px-2 py-0.5 rounded text-ink font-bold">CORP-KICKOFF-99</span>
        </div>
        <h1 className="text-3xl font-black tracking-tight uppercase">Statement of Work (SOW) &amp; Sprint Planning</h1>
      </div>

      {checkout.notices.length > 0 && (
        <ul className="flex flex-col gap-1 border border-stamp-red/40 bg-stamp-red/5 p-3 text-sm text-stamp-red font-mono">
          {checkout.notices.map((n, i) => (
            <li key={`${n.kind}-${i}`}>{`[WARNING] ${n.message}`}</li>
          ))}
        </ul>
      )}

      {error === 'server' && (
        <p role="alert" className="border border-stamp-red/40 bg-stamp-red/5 p-3 text-sm text-stamp-red font-mono">
          [CRITICAL_ERROR] SOW authorization failed. Please retry budget release.
        </p>
      )}

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {/* Contact + address form (no-JS). */}
        <form action={submitCheckoutAction} className="flex flex-col gap-6 md:col-span-2">
          <fieldset className="flex flex-col gap-4 border border-ink/10 p-4 rounded bg-ink/5">
            <legend className="px-2 text-sm font-bold uppercase tracking-wider bg-paper border border-ink/10 rounded">
              Client Stakeholder Info
            </legend>

            <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wide">
              <span className="font-bold text-ink/70">Primary Stakeholder Name</span>
              <input
                name="name"
                required
                defaultValue={val('name')}
                placeholder="e.g. Senior VP of Alignment"
                className="border border-ink/20 px-3 py-2 text-sm font-sans normal-case"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wide">
              <span className="font-bold text-ink/70">Communication Endpoint (Email)</span>
              <input
                name="email"
                type="email"
                required
                defaultValue={val('email')}
                aria-invalid={isInvalid('email')}
                placeholder="stakeholder@company.com"
                className="border border-ink/20 px-3 py-2 text-sm font-sans normal-case"
              />
              {isInvalid('email') && (
                <span className="text-xs text-stamp-red font-sans normal-case">Enter a valid email address.</span>
              )}
            </label>

            <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wide">
              <span className="font-bold text-ink/70">Paging Channel (10-Digit Mobile)</span>
              <input
                name="phone"
                inputMode="numeric"
                pattern="[6-9][0-9]{9}"
                required
                defaultValue={val('phone')}
                aria-invalid={isInvalid('phone')}
                placeholder="9876543210"
                className="border border-ink/20 px-3 py-2 text-sm font-sans normal-case"
              />
              {isInvalid('phone') && (
                <span className="text-xs text-stamp-red font-sans normal-case">
                  Enter a valid 10-digit Indian mobile number.
                </span>
              )}
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-4 border border-ink/10 p-4 rounded bg-ink/5">
            <legend className="px-2 text-sm font-bold uppercase tracking-wider bg-paper border border-ink/10 rounded">
              Deployment Destination (Shipping)
            </legend>

            <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wide">
              <span className="font-bold text-ink/70">Target Deployment URI (Address Line 1)</span>
              <input
                name="line1"
                required
                defaultValue={val('line1')}
                placeholder="e.g. Block A, Office Room 302"
                className="border border-ink/20 px-3 py-2 text-sm font-sans normal-case"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wide">
              <span className="font-bold text-ink/70">Deployment Sub-path (Address Line 2)</span>
              <input
                name="line2"
                defaultValue={val('line2')}
                placeholder="e.g. Sector 5, Tech Park East"
                className="border border-ink/20 px-3 py-2 text-sm font-sans normal-case"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wide">
                <span className="font-bold text-ink/70">Operational Node (City)</span>
                <input
                  name="city"
                  defaultValue={val('city')}
                  placeholder="e.g. Bengaluru"
                  className="border border-ink/20 px-3 py-2 text-sm font-sans normal-case"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wide">
                <span className="font-bold text-ink/70">Regional Partition (State)</span>
                <input
                  name="state"
                  defaultValue={val('state')}
                  placeholder="e.g. Karnataka"
                  className="border border-ink/20 px-3 py-2 text-sm font-sans normal-case"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wide">
              <span className="font-bold text-ink/70">Zip Gateway / Routing Index (Pincode)</span>
              <input
                name="pincode"
                inputMode="numeric"
                pattern="[1-9][0-9]{5}"
                required
                defaultValue={val('pincode')}
                aria-invalid={error === 'pincode'}
                placeholder="e.g. 560001"
                className="border border-ink/20 px-3 py-2 text-sm font-sans normal-case"
              />
              {error === 'pincode' && (
                <span className="text-xs text-stamp-red font-sans normal-case">
                  This pincode is not recognized or not serviceable.
                </span>
              )}
              <span className="text-xs text-muted font-sans normal-case">
                Serviceable examples: {samplePincodes}
              </span>
            </label>

            {error === 'address' && (
              <p role="alert" className="text-xs text-stamp-red font-sans normal-case">
                Please provide your name and address line 1.
              </p>
            )}
          </fieldset>

          <button
            type="submit"
            className="bg-ink hover:bg-ink/90 px-6 py-3.5 text-sm font-black uppercase tracking-wider text-paper transition-colors duration-150 rounded"
          >
            Sign SOW &amp; Release Budget
          </button>
        </form>

        {/* JIRA / Linear styled Issue Details sidebar */}
        <section aria-label="Order summary" className="flex flex-col gap-4 border border-ink/10 p-4 rounded">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink/50 border-b border-ink/10 pb-2">Issue Details</h2>
          
          <div className="grid grid-cols-2 gap-y-3 text-xs font-mono mb-4">
            <span className="text-ink/50">Epic Link:</span>
            <span className="font-bold text-corporate">Notice Period Sprint</span>
            
            <span className="text-ink/50">Priority:</span>
            <span className="font-bold text-stamp-red">P0 - Blocker</span>
            
            <span className="text-ink/50">Assignee:</span>
            <span className="font-bold text-ink">Logistics Subsystem</span>
            
            <span className="text-ink/50">Sprint Status:</span>
            <span className="bg-ink/5 px-2 py-0.5 rounded w-fit text-ink font-bold font-mono">BACKLOG</span>
          </div>

          <h3 className="text-xs font-bold uppercase tracking-wider text-ink/50 border-b border-ink/10 pb-2">Scope of Work</h3>
          <ul className="flex flex-col divide-y divide-ink/10">
            {checkout.lines.map((line) => (
              <li key={line.variantId} className="flex flex-col gap-1 py-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold text-ink">{line.slogan}</span>
                  <span className="font-mono text-xs">{inr(line.lineTotal)}</span>
                </div>
                <span className="text-xs text-muted font-mono">
                  {line.color} / {line.size} / {line.fit} · Qty {line.qty}
                </span>
              </li>
            ))}
          </ul>

          <div className="border-t border-ink/15 pt-3">
            <dl className="flex flex-col gap-2 text-xs font-mono">
              <div className="flex justify-between">
                <dt className="text-ink/50">SOW Subtotal:</dt>
                <dd>{inr(totals.subtotal as number)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/50">Logistics Cost:</dt>
                <dd>{inr(totals.shipping as number)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/50">Compliance Tax (GST):</dt>
                <dd>{inr(totals.tax as number)}</dd>
              </div>
              {(totals.discount as number) > 0 && (
                <div className="flex justify-between text-stamp-red">
                  <dt className="text-stamp-red/70">Approved Discount:</dt>
                  <dd>-{inr(totals.discount as number)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-ink pt-2 text-sm font-black font-sans">
                <dt className="uppercase tracking-wider">Total Budget Allocation</dt>
                <dd>{inr(totals.total as number)}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
    </main>
  );
}
