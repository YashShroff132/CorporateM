/**
 * /checkout/pay/[orderId] — open Razorpay hosted checkout for a created order.
 *
 * Server component: loads the order and its Razorpay checkout options (built
 * with the Payment_Service using only the public key id — the secret never
 * leaves the server, Req 8.9). When Razorpay keys are not configured, or the
 * Razorpay order could not be created, it renders a clear "Payment not
 * configured" message instead of crashing (build must not require keys).
 *
 * The actual Razorpay Checkout widget is opened by a small client component that
 * loads the hosted checkout.js script and posts the success payload to the
 * verify route handler.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { toINRString, makePaise } from '@/lib/money';
import { loadOrder } from '@/server/order-data';
import { checkoutOptionsForOrder, isRazorpayConfigured } from '@/server/payment-data';
import { TrackOnMount } from '@/components/TrackOnMount';
import { RazorpayCheckoutButton } from './RazorpayCheckoutButton';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Payment',
};

interface PayPageProps {
  params: Promise<{ orderId: string }>;
}

function inr(paise: number): string {
  const validated = makePaise(paise);
  return `₹${validated.ok ? toINRString(validated.value) : '0.00'}`;
}

export default async function PayPage({ params }: PayPageProps) {
  const { orderId } = await params;
  const order = await loadOrder(orderId);
  if (order === null) {
    notFound();
  }

  if (order.status === 'PAID') {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
        {/* Emit the payment_success funnel event on mount (Req 19.5). */}
        <TrackOnMount
          event="payment_success"
          props={{ orderId: order.id, value: order.total, currency: 'INR' }}
        />
        <h1 className="text-3xl font-black tracking-tight">Payment received</h1>
        <p className="text-muted">
          Thanks — your payment for order {order.id} is confirmed.
        </p>
        <Link
          href="/shop"
          className="w-fit border border-ink px-4 py-2 text-sm font-bold uppercase tracking-wide"
        >
          Continue shopping
        </Link>
      </main>
    );
  }

  const options = await checkoutOptionsForOrder(orderId);

  if (!isRazorpayConfigured() || options === null) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
        <h1 className="text-3xl font-black tracking-tight">Payment</h1>
        <p
          role="alert"
          className="border border-stamp-red/40 bg-stamp-red/5 p-4 text-sm text-stamp-red"
        >
          Payment not configured — set the RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET,
          and RAZORPAY_WEBHOOK_SECRET environment variables to enable checkout.
        </p>
        <p className="text-sm text-muted">
          Your order {order.id} has been created with a total of {inr(order.total)}.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="text-3xl font-black tracking-tight">Payment</h1>
      <p className="text-sm text-muted">
        Order {order.id} · Amount due {inr(order.total)}
      </p>
      <RazorpayCheckoutButton
        options={{
          key: options.key,
          amount: options.amount as number,
          currency: options.currency,
          orderId: options.orderId,
          receipt: options.receipt,
        }}
      />
      <noscript>
        <p className="text-sm text-stamp-red">
          JavaScript is required to complete payment with Razorpay.
        </p>
      </noscript>
    </main>
  );
}
