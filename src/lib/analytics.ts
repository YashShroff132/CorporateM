/**
 * Provider-agnostic, non-blocking analytics (Req 19.4, 19.5, 19.8).
 *
 * `trackEvent(name, props)` dispatches a single funnel event to whichever
 * providers are configured client-side: GA4 via the `gtag` global and PostHog
 * via its injected `posthog` global. Both dispatches are fire-and-forget and
 * fully wrapped in try/catch so analytics can NEVER block, delay, or throw into
 * a page render or a server-action/user flow (Req 19.8). If a provider global
 * is absent (script not loaded, keys unset, provider unavailable) the call is a
 * silent no-op.
 *
 * This module is safe to import from both client and server code: on the server
 * (or during SSR) `window` is undefined and every call is a no-op, so importing
 * it never pulls provider SDKs into a server bundle.
 */

/** The standard funnel events emitted across the storefront (Req 19.5). */
export type AnalyticsEvent =
  | 'product_view'
  | 'add_to_cart'
  | 'begin_checkout'
  | 'payment_success';

/** Arbitrary, JSON-serializable event properties. */
export type AnalyticsProps = Record<string, unknown>;

type Gtag = (command: string, eventName: string, params?: AnalyticsProps) => void;

interface PostHogLike {
  capture: (event: string, properties?: AnalyticsProps) => void;
}

interface AnalyticsWindow {
  gtag?: Gtag;
  posthog?: PostHogLike;
}

/** Resolve the browser window with the analytics globals, or `undefined`. */
function analyticsWindow(): AnalyticsWindow | undefined {
  if (typeof window === 'undefined') return undefined;
  return window as unknown as AnalyticsWindow;
}

/** Send to GA4 through `gtag` if present. Never throws. */
function sendToGa4(win: AnalyticsWindow, name: string, props: AnalyticsProps): void {
  try {
    if (typeof win.gtag === 'function') {
      win.gtag('event', name, props);
    }
  } catch {
    // Swallow: analytics must never affect the user flow (Req 19.8).
  }
}

/** Send to PostHog through the injected global if present. Never throws. */
function sendToPostHog(win: AnalyticsWindow, name: string, props: AnalyticsProps): void {
  try {
    const ph = win.posthog;
    if (ph !== undefined && typeof ph.capture === 'function') {
      ph.capture(name, props);
    }
  } catch {
    // Swallow: analytics must never affect the user flow (Req 19.8).
  }
}

/**
 * Track a funnel event, dispatching to every configured provider. Fully
 * non-blocking and exception-safe: any failure (missing global, provider error,
 * serialization issue) is swallowed so the caller's flow is never interrupted
 * (Req 19.8). Emits synchronously to the in-page provider queues, so delivery
 * is initiated immediately, well within the 2-second bound (Req 19.5).
 */
export function trackEvent(name: AnalyticsEvent | string, props: AnalyticsProps = {}): void {
  try {
    const win = analyticsWindow();
    if (win === undefined) return; // Server / SSR: no-op.
    sendToGa4(win, name, props);
    sendToPostHog(win, name, props);
  } catch {
    // Defense in depth — never let analytics surface an error to the caller.
  }
}

// Convenience wrappers for the standard funnel events (Req 19.5).
export const trackProductView = (props: AnalyticsProps = {}): void =>
  trackEvent('product_view', props);
export const trackAddToCart = (props: AnalyticsProps = {}): void =>
  trackEvent('add_to_cart', props);
export const trackBeginCheckout = (props: AnalyticsProps = {}): void =>
  trackEvent('begin_checkout', props);
export const trackPaymentSuccess = (props: AnalyticsProps = {}): void =>
  trackEvent('payment_success', props);
