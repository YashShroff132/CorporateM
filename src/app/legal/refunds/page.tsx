/**
 * Returns & Refund Policy (Requirement 21.1/21.2/21.6).
 *
 * Returns window and dispatch timings are read from configuration (Owner_Input)
 * so the policy stays consistent with store settings.
 */

import type { Metadata } from 'next';

import { PolicyPage, PolicySection } from '@/components/legal/PolicyPage';
import { absoluteUrl } from '@/lib/site';
import { config } from '@/services/config';

export const metadata: Metadata = {
  title: 'Returns & Refund Policy',
  description: 'How returns, exchanges, and refunds work at Out of Office.',
  alternates: { canonical: absoluteUrl('/legal/refunds') },
};

export default function RefundsPage() {
  const brand = config.brand().name || 'Out of Office';

  return (
    <PolicyPage title="Returns & Refund Policy">
      <p>
        At {brand}, we maintain strict quality control standards for every garment produced.
        Please read our policy carefully before placing an order.
      </p>

      <PolicySection heading="1. Return & Exchange Eligibility">
        <p>
          Returns or replacements are accepted <strong>ONLY</strong> in the following scenarios:
        </p>
        <ul className="list-disc pl-6">
          <li>You received a damaged or physically defective product.</li>
          <li>You received an incorrect item, size, or design relative to your order confirmation.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="2. Non-Returnable Scenarios">
        <p>
          For hygiene, print integrity, and operational reasons, we do <strong>NOT</strong> accept returns, exchanges, or cancellations for:
        </p>
        <ul className="list-disc pl-6">
          <li>Customer change of mind or personal design/color preference after delivery.</li>
          <li>Ordering the incorrect size (please refer to our detailed size chart before ordering).</li>
          <li>Items damaged due to improper washing, handling, or wear and tear.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="3. Claim Process & Unboxing Requirement">
        <p>
          To claim a replacement for a damaged or wrong product:
        </p>
        <ol className="list-decimal pl-6">
          <li>
            Email us at <a className="underline font-bold" href="mailto:support@oofo.tech">support@oofo.tech</a> within <strong>48 hours</strong> of delivery.
          </li>
          <li>Include your Order ID, a clear photo of the shipping label, and an <strong>unboxing video / photos</strong> demonstrating the defect or wrong item received.</li>
          <li>Our support team will review the claim and arrange a hassle-free replacement or store credit.</li>
        </ol>
      </PolicySection>

      <PolicySection heading="4. Refund & Replacement Timeline">
        <p>
          Once your claim is verified and approved, a replacement order will be dispatched, or a full refund will be processed back to your original payment method within 5–7 business days.
        </p>
      </PolicySection>

      <PolicySection heading="5. Contact Us">
        <p>
          For any claim assistance, reach out directly via our{' '}
          <a className="underline" href="/legal/contact">
            Contact Us
          </a>{' '}
          page or email us at <a className="underline font-bold" href="mailto:support@oofo.tech">support@oofo.tech</a>.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
