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
    interface AddressSnapshot {
      name?: string;
      email?: string;
      phone?: string;
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      pincode?: string;
    }
    const addr = (order.addressSnapshot as AddressSnapshot) || {};
    const clientName = addr.name || 'Client Stakeholder';

    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6 border border-ink/10 rounded my-8 bg-paper">
        {/* Emit the payment_success funnel event on mount (Req 19.5). */}
        <TrackOnMount
          event="payment_success"
          props={{ orderId: order.id, value: order.total, currency: 'INR' }}
        />
        
        {/* MoM Header */}
        <div className="border-b border-ink/20 pb-4 text-center font-mono">
          <div className="text-xs uppercase tracking-widest text-ink/50 mb-1">Internal Reference: MoM-ORD-{order.id.slice(-8).toUpperCase()}</div>
          <h1 className="text-2xl font-black tracking-tight uppercase">Minutes of Meeting (MoM)</h1>
          <p className="text-xs text-ink/70">Subject: Alignment Sync &amp; Backlog Release Confirmation</p>
        </div>

        {/* Meeting Metadata */}
        <div className="border border-ink/10 rounded p-4 bg-ink/5 text-xs font-mono grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span className="text-ink/50 uppercase block font-bold">Attendees:</span>
            <ul className="list-disc list-inside mt-1 text-ink">
              <li>{clientName} (Client Stakeholder)</li>
              <li>Corporate Cult Retail (Service Provider)</li>
            </ul>
          </div>
          <div>
            <span className="text-ink/50 uppercase block font-bold">Agenda:</span>
            <p className="mt-1 text-ink">E2E Deliverables, Budget Release &amp; Sprint Kickoff</p>
          </div>
          <div>
            <span className="text-ink/50 uppercase block font-bold">Status:</span>
            <span className="mt-1 inline-block bg-corporate/10 text-corporate px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              CLOSED - PAID
            </span>
          </div>
          <div>
            <span className="text-ink/50 uppercase block font-bold">Total Budget Released:</span>
            <p className="mt-1 font-bold text-ink">{inr(order.total)}</p>
          </div>
        </div>

        {/* Discussion Summary & Action Items */}
        <div className="flex flex-col gap-4 font-mono text-xs">
          <div>
            <h2 className="font-bold uppercase tracking-wider text-ink/75 border-b border-ink/10 pb-1 mb-2">1. Discussion Summary</h2>
            <p className="text-ink/80 leading-relaxed font-sans normal-case">
              The Client Stakeholder approved and signed the Statement of Work (SOW). Payment has been securely verified and captured via Razorpay. The sprint backlog is now cleared for operational fulfillment.
            </p>
          </div>

          <div>
            <h2 className="font-bold uppercase tracking-wider text-ink/75 border-b border-ink/10 pb-1 mb-2">2. Deliverables &amp; Action Items</h2>
            <ul className="flex flex-col gap-2.5">
              <li className="flex items-start gap-2.5">
                <span className="text-corporate font-bold font-mono">[x]</span>
                <div>
                  <span className="font-bold">Budget Release (Action Item #1)</span>
                  <p className="text-muted font-sans normal-case">Budget captured. Owner: Finance Subsystem. Status: Completed.</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-corporate font-bold font-mono">[x]</span>
                <div>
                  <span className="font-bold">Backlog Grooming (Action Item #2)</span>
                  <p className="text-muted font-sans normal-case">Slogan assets verified and reserved in inventory. Owner: Warehouse. Status: Completed.</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-ink/50 font-bold font-mono">[ ]</span>
                <div>
                  <span className="font-bold">Deployment to Production (Action Item #3)</span>
                  <p className="text-muted font-sans normal-case">Shipment dispatch to: {addr.line1}, {addr.city}, {addr.state} ({addr.pincode}). Owner: Logistics. Status: Awaiting Dispatch. Target: 2-3 business days.</p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Action Button */}
        <div className="border-t border-ink/10 pt-4 flex justify-between items-center gap-4">
          <span className="text-xs text-muted font-mono normal-case">Sent from my Outlook for iOS</span>
          <Link
            href="/shop"
            className="border border-ink bg-ink text-paper px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-ink/90 transition-colors duration-150 rounded"
          >
            Sprint Planning (Return to Shop)
          </Link>
        </div>
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
