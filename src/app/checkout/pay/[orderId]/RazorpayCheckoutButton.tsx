'use client';

/**
 * Razorpay hosted-checkout launcher (client component).
 *
 * Loads Razorpay's `checkout.js` script on demand and opens the hosted checkout
 * with the server-provided options (public key id, amount in paise, Razorpay
 * order id, prefill). On success Razorpay returns the payment id, order id, and
 * signature, which we POST to `/api/payment/verify` for server-side signature
 * verification (Req 8.3). Only after the server confirms do we treat the payment
 * as done and redirect back to the pay page (which then shows the paid state).
 *
 * The Razorpay secret is never present here — only the publishable key id
 * (Req 8.9).
 */

import { useCallback, useEffect, useState } from 'react';

const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/** The subset of Razorpay options this launcher needs (amount in paise). */
export interface CheckoutButtonOptions {
  readonly key: string;
  readonly amount: number;
  readonly currency: string;
  readonly orderId: string;
  readonly receipt: string;
}

interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

// Minimal typing for the injected Razorpay global.
interface RazorpayInstance {
  open: () => void;
}
interface RazorpayConstructor {
  new (options: Record<string, unknown>): RazorpayInstance;
}
declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    if (window.Razorpay !== undefined) {
      resolve(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_SCRIPT_SRC}"]`,
    );
    if (existing !== null) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function RazorpayCheckoutButton({
  options,
}: {
  options: CheckoutButtonOptions;
}) {
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'verifying' | 'error'
  >('idle');
  const [message, setMessage] = useState<string>('');

  const verify = useCallback(async (payload: RazorpaySuccess) => {
    setStatus('verifying');
    try {
      const res = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { verified?: boolean };
      if (res.ok && data.verified === true) {
        // Reload to render the confirmed/paid state from the server.
        window.location.reload();
        return;
      }
      setStatus('error');
      setMessage('We could not verify your payment. You have not been charged twice; please try again.');
    } catch {
      setStatus('error');
      setMessage('Network error verifying payment. Please try again.');
    }
  }, []);

  const openCheckout = useCallback(async () => {
    setStatus('loading');
    setMessage('');
    const ready = await loadRazorpayScript();
    if (!ready || window.Razorpay === undefined) {
      setStatus('error');
      setMessage('Could not load the payment widget. Check your connection and retry.');
      return;
    }

    const rzp = new window.Razorpay({
      key: options.key,
      amount: options.amount,
      currency: options.currency,
      order_id: options.orderId,
      name: 'Out of Office',
      description: `Order ${options.receipt}`,
      handler: (response: RazorpaySuccess) => {
        void verify(response);
      },
      modal: {
        ondismiss: () => {
          setStatus('idle');
        },
      },
    });
    rzp.open();
  }, [options, verify]);

  // Load the script and open checkout automatically on mount.
  useEffect(() => {
    let active = true;
    async function init() {
      const ready = await loadRazorpayScript();
      if (ready && active) {
        // Yield execution to allow window.Razorpay to initialize completely
        setTimeout(() => {
          if (active) {
            void openCheckout();
          }
        }, 100);
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, [openCheckout]);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          void openCheckout();
        }}
        disabled={status === 'loading' || status === 'verifying'}
        className="bg-highlighter px-6 py-3 text-sm font-black uppercase tracking-wide text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'loading'
          ? 'Opening…'
          : status === 'verifying'
            ? 'Verifying…'
            : 'Pay with Razorpay'}
      </button>
      {message.length > 0 && (
        <p role="alert" className="text-sm text-stamp-red">
          {message}
        </p>
      )}
    </div>
  );
}
