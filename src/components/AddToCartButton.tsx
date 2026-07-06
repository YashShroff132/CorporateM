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
      className="bg-highlighter px-4 py-3 text-sm font-black uppercase tracking-wide text-ink disabled:cursor-not-allowed disabled:opacity-50"
    >
      {outOfStock ? 'Out of stock' : 'Add to cart'}
    </button>
  );
}
