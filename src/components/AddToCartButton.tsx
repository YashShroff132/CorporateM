'use client';

/**
 * AddToCartButton — the PDP add-to-cart submit control (client component).
 *
 * Renders the same submit button as before but emits the `add_to_cart` funnel
 * event on click before the enclosing server-action form submits (Req 19.5).
 * Tracking is fire-and-forget and non-blocking, so the form submission proceeds
 * normally whether or not analytics is configured (Req 19.8).
 */

import { trackAddToCart, type AnalyticsProps } from '@/lib/analytics';

export function AddToCartButton({
  enabled,
  outOfStock,
  eventProps,
}: {
  enabled: boolean;
  outOfStock: boolean;
  eventProps?: AnalyticsProps;
}) {
  return (
    <button
      type="submit"
      disabled={!enabled}
      aria-disabled={!enabled}
      onClick={() => {
        if (enabled) trackAddToCart(eventProps ?? {});
      }}
      className="w-full bg-highlighter hover:bg-highlighter/90 text-ink px-6 py-4 text-sm font-black uppercase tracking-wider rounded-lg shadow-md hover:shadow-lg transition-all duration-200 active:scale-[0.99] border border-ink/10 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
    >
      <span>{outOfStock ? 'Out of stock' : 'Add to cart'}</span>
      {!outOfStock && <span className="text-base leading-none">→</span>}
    </button>
  );
}
