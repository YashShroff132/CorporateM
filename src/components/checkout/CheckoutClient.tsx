'use client';

import { useState } from 'react';
import { toINRString, makePaise } from '@/lib/money';
import type { PricedCheckout } from '@/server/checkout-data';
import { ProductImage } from '@/components/ProductImage';
import { OOOLogo } from '@/components/OOOLogo';

interface CheckoutClientProps {
  checkout: PricedCheckout;
  error?: string;
  invalidFields: string[];
  retainedValues: Record<string, string>;
  submitCheckoutAction: (formData: FormData) => Promise<void>;
}

function inr(paise: number): string {
  const validated = makePaise(paise);
  return `₹${validated.ok ? toINRString(validated.value) : '0.00'}`;
}

export function CheckoutClient({
  checkout,
  error,
  invalidFields,
  retainedValues,
  submitCheckoutAction,
}: CheckoutClientProps) {
  const val = (k: string) => retainedValues[k] ?? '';
  const [shippingUpgrade, setShippingUpgrade] = useState<'standard' | 'priority'>('standard');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountType: string;
    discountValue: number;
    discountPaise: number;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  const isInvalid = (f: string): boolean => invalidFields.includes(f);

  // Calculations in paise
  const subtotalPaise = checkout.totals.subtotal as number;
  const baseShippingPaise = checkout.totals.shipping as number;
  const extraShippingPaise = shippingUpgrade === 'priority' ? 20000 : 0;
  const shippingPaise = baseShippingPaise + extraShippingPaise;

  const taxPaise = checkout.totals.tax as number;
  const baseDiscountPaise = checkout.totals.discount as number;
  const couponDiscountPaise = appliedCoupon ? appliedCoupon.discountPaise : 0;
  const totalDiscountPaise = Math.min(subtotalPaise, baseDiscountPaise + couponDiscountPaise);

  const finalTotalPaise = Math.max(0, subtotalPaise - totalDiscountPaise) + shippingPaise + taxPaise;

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;

    setIsApplyingCoupon(true);
    setCouponError(null);

    try {
      const res = await fetch('/api/coupon/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponInput.trim(),
          subtotalPaise,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setAppliedCoupon(data.coupon);
        setCouponError(null);
      } else {
        setCouponError(data.error || 'Invalid coupon code.');
      }
    } catch {
      setCouponError('Failed to validate coupon code.');
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError(null);
  };

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      {/* Contact + address form */}
      <form action={submitCheckoutAction} className="flex flex-col gap-4">
        {/* Hidden inputs to pass interactive state to server action */}
        <input type="hidden" name="shipping_upgrade" value={shippingUpgrade} />
        <input type="hidden" name="coupon_code" value={appliedCoupon?.code || ''} />

        <fieldset className="flex flex-col gap-3">
          <legend className="text-lg font-bold">Contact</legend>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold uppercase tracking-wide">Full name</span>
            <input
              name="name"
              required
              defaultValue={val('name')}
              className="border border-ink/20 dark:border-white/20 bg-transparent text-ink px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-ink dark:focus:ring-white"
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
              className="border border-ink/20 dark:border-white/20 bg-transparent text-ink px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-ink dark:focus:ring-white"
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
              className="border border-ink/20 dark:border-white/20 bg-transparent text-ink px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-ink dark:focus:ring-white"
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
              className="border border-ink/20 dark:border-white/20 bg-transparent text-ink px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-ink dark:focus:ring-white"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold uppercase tracking-wide">Address line 2</span>
            <input
              name="line2"
              defaultValue={val('line2')}
              className="border border-ink/20 dark:border-white/20 bg-transparent text-ink px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-ink dark:focus:ring-white"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold uppercase tracking-wide">City</span>
              <input
                name="city"
                required
                defaultValue={val('city')}
                className="border border-ink/20 dark:border-white/20 bg-transparent text-ink px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-ink dark:focus:ring-white"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold uppercase tracking-wide">State</span>
              <input
                name="state"
                required
                defaultValue={val('state')}
                className="border border-ink/20 dark:border-white/20 bg-transparent text-ink px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-ink dark:focus:ring-white"
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
              className="border border-ink/20 dark:border-white/20 bg-transparent text-ink px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-ink dark:focus:ring-white"
            />
            {error === 'pincode' && (
              <span className="text-xs text-stamp-red">
                Enter a valid 6-digit pincode.
              </span>
            )}
          </label>

          {error === 'address' && (
            <p role="alert" className="text-xs text-stamp-red">
              Please provide your name, address, city, and state.
            </p>
          )}
        </fieldset>

        {/* Priority Express Delivery Options */}
        <div className="border border-stamp-red/20 bg-stamp-red/5 dark:bg-stamp-red/10 p-4 rounded-lg flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <span className="text-stamp-red text-base leading-none">🔥</span>
            <div>
              <h3 className="text-xs font-black text-ink dark:text-white uppercase tracking-wider">High Order Demand</h3>
              <p className="text-xs text-muted mt-0.5">Due to high order volume, standard printing & delivery is currently experiencing delays.</p>
            </div>
          </div>
          
          <div className="flex flex-col gap-2.5 mt-1 border-t border-ink/10 dark:border-white/10 pt-3 font-mono text-xs">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <input 
                  type="radio" 
                  name="shipping_upgrade_choice" 
                  value="standard" 
                  checked={shippingUpgrade === 'standard'}
                  onChange={() => setShippingUpgrade('standard')}
                  className="text-ink dark:text-white focus:ring-ink"
                />
                <span>Standard Delivery (Free, Delayed)</span>
              </div>
              <span className="font-bold">₹0.00</span>
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <input 
                  type="radio" 
                  name="shipping_upgrade_choice" 
                  value="priority" 
                  checked={shippingUpgrade === 'priority'}
                  onChange={() => setShippingUpgrade('priority')}
                  className="text-ink dark:text-white focus:ring-ink"
                />
                <span className="flex items-center gap-1 font-bold text-stamp-red dark:text-highlighter">
                  ⚡ Priority Express Dispatch
                </span>
              </div>
              <span className="font-bold">₹200.00</span>
            </label>
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-highlighter hover:bg-highlighter/90 text-ink px-6 py-4 text-sm font-black uppercase tracking-wider rounded-lg shadow-md hover:shadow-lg transition-all duration-200 active:scale-[0.99] border border-ink/10 flex items-center justify-center gap-2 cursor-pointer mt-2"
        >
          <span>Continue to payment</span>
          <span className="text-base leading-none">→</span>
        </button>
      </form>

      {/* Order summary */}
      <section aria-label="Order summary" className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">Order summary</h2>
        <ul className="flex flex-col divide-y divide-ink/10 border-y border-ink/10">
          {checkout.lines.map((line) => (
            <li key={line.variantId} className="flex gap-3 py-3 text-sm">
              <div className="h-16 w-14 shrink-0 overflow-hidden rounded border border-ink/10 bg-paper relative">
                {line.imageUrl && !line.imageUrl.startsWith('data:') ? (
                  <ProductImage
                    src={line.imageUrl}
                    alt={line.slogan}
                    width={56}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col justify-between p-1.5 text-center h-full w-full bg-ink text-paper dark:bg-paper dark:text-ink font-mono text-[7px]">
                    <OOOLogo className="h-2.5 w-auto mx-auto mt-0.5" />
                    <span className="font-bold uppercase tracking-tighter truncate">{line.slogan}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col flex-1 gap-0.5 justify-center">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold">{line.slogan}</span>
                  <span className="font-semibold">{inr(line.lineTotal)}</span>
                </div>
                <span className="text-xs text-muted font-mono">
                  {line.color} · {line.size} · {line.fit} · Qty {line.qty}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {/* Coupon Code Input Component */}
        <div className="flex flex-col gap-2 bg-ink/5 p-3 rounded-lg border border-ink/10">
          <span className="text-xs font-bold uppercase tracking-wider text-ink/70">Promo / Coupon Code</span>
          {appliedCoupon ? (
            <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded text-xs font-mono text-emerald-600 dark:text-emerald-400">
              <div className="flex items-center gap-2">
                <span className="font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded text-[10px]">
                  {appliedCoupon.code}
                </span>
                <span>Applied ({appliedCoupon.discountType === 'PERCENT' ? `${appliedCoupon.discountValue}% OFF` : inr(appliedCoupon.discountPaise)})</span>
              </div>
              <button
                type="button"
                onClick={handleRemoveCoupon}
                className="text-stamp-red font-bold hover:underline text-[11px]"
              >
                Remove
              </button>
            </div>
          ) : (
            <form onSubmit={handleApplyCoupon} className="flex gap-2">
              <input
                type="text"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                placeholder="Try OOO10"
                className="flex-1 border border-ink/20 dark:border-white/20 bg-paper px-3 py-1.5 text-xs rounded uppercase font-mono tracking-wider focus:outline-none focus:ring-1 focus:ring-ink"
              />
              <button
                type="submit"
                disabled={isApplyingCoupon || !couponInput.trim()}
                className="bg-ink text-paper px-4 py-1.5 text-xs font-bold uppercase tracking-wide rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isApplyingCoupon ? '...' : 'Apply'}
              </button>
            </form>
          )}
          {couponError && (
            <span className="text-xs text-stamp-red font-mono">{couponError}</span>
          )}
        </div>

        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{inr(subtotalPaise)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Shipping</dt>
            <dd>{inr(shippingPaise)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Tax (GST)</dt>
            <dd>{inr(taxPaise)}</dd>
          </div>
          {totalDiscountPaise > 0 && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
              <dt>Discount {appliedCoupon ? `(${appliedCoupon.code})` : ''}</dt>
              <dd>-{inr(totalDiscountPaise)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-ink pt-2 text-base font-black">
            <dt>Total</dt>
            <dd className="text-lg text-ink dark:text-white">{inr(finalTotalPaise)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
