/**
 * Returns & Refund Policy (Requirement 21.1/21.2/21.6).
 *
 * Returns window and dispatch timings are read from configuration (Owner_Input)
 * so the policy stays consistent with store settings.
 */

import type { Metadata } from 'next';

import { PolicyPage, PolicySection, Placeholder } from '@/components/legal/PolicyPage';
import { absoluteUrl } from '@/lib/site';
import { config } from '@/services/config';

export const metadata: Metadata = {
  title: 'Returns & Refund Policy — Corporate Cult',
  description: 'How returns, exchanges, and refunds work at Corporate Cult.',
  alternates: { canonical: absoluteUrl('/legal/refunds') },
};

export default function RefundsPage() {
  const brand = config.brand().name || 'Corporate Cult';
  const returnsWindow = config.returnsWindow();
  const supportEmail = process.env.SUPPORT_EMAIL ?? '';

  return (
    <PolicyPage title="Returns & Refund Policy">
      <p>
        We want you to be happy with your {brand} order. This policy explains when
        and how you can return an item and how refunds are processed.
      </p>

      <PolicySection heading="1. Return window">
        <p>
          You may request a return within{' '}
          <Placeholder value={returnsWindow} label="RETURNS_WINDOW" /> of delivery,
          provided the item is unused, unwashed, and returned with its original
          tags and packaging.
        </p>
      </PolicySection>

      <PolicySection heading="2. Non-returnable items">
        <p>
          For hygiene and quality reasons, certain items may not be eligible for
          return unless they arrive damaged or defective. Any such exclusions will
          be indicated on the product page.
        </p>
      </PolicySection>

      <PolicySection heading="3. How to request a return">
        <ol className="list-decimal pl-6">
          <li>
            Email us at{' '}
            <Placeholder value={supportEmail} label="SUPPORT_EMAIL" /> with your
            order number and the reason for return.
          </li>
          <li>Our team will review the request and share return instructions.</li>
          <li>
            Pack the item securely and hand it to the courier as instructed.
          </li>
        </ol>
      </PolicySection>

      <PolicySection heading="4. Damaged or wrong items">
        <p>
          If you receive a damaged, defective, or incorrect item, contact us within
          48 hours of delivery with photographs so we can arrange a replacement or
          refund at no additional cost to you.
        </p>
      </PolicySection>

      <PolicySection heading="5. Refunds">
        <p>
          Once your returned item is received and inspected, we will notify you of
          the outcome. Approved refunds are processed to your original payment
          method. After a refund is initiated, the amount is typically credited
          within 5–7 business days, depending on your bank or payment provider.
        </p>
      </PolicySection>

      <PolicySection heading="6. Exchanges">
        <p>
          Where an exchange (for example, a different size) is available, we will
          confirm stock and arrange the exchange once the original item is
          returned.
        </p>
      </PolicySection>

      <PolicySection heading="7. Contact">
        <p>
          For any question about returns or refunds, reach us via our{' '}
          <a className="underline" href="/legal/contact">
            Contact Us
          </a>{' '}
          page.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
