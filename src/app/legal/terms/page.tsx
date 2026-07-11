/**
 * Terms & Conditions (Requirement 21.1/21.2/21.6).
 *
 * Generic-but-real template for an Indian D2C apparel store. Brand and legal
 * entity values are sourced from configuration/env; unknown values render as
 * clearly identifiable placeholders (Req 21.6).
 */

import type { Metadata } from 'next';

import { PolicyPage, PolicySection, Placeholder } from '@/components/legal/PolicyPage';
import { absoluteUrl } from '@/lib/site';
import { config } from '@/services/config';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'The terms that govern your use of the Out of Office store.',
  alternates: { canonical: absoluteUrl('/legal/terms') },
};

export default function TermsPage() {
  const brand = config.brand().name || 'Out of Office';
  const entity = config.legalEntityName();
  const entityAddress = config.legalEntityAddress();

  return (
    <PolicyPage title="Terms & Conditions">
      <p>
        These Terms &amp; Conditions govern your access to and use of the {brand}{' '}
        website and your purchase of products from us. By using this site or
        placing an order, you agree to these terms. The store is operated by{' '}
        <Placeholder value={entity} label="LEGAL_ENTITY_NAME" />,{' '}
        <Placeholder value={entityAddress} label="LEGAL_ENTITY_ADDRESS" />.
      </p>

      <PolicySection heading="1. Eligibility">
        <p>
          You must be capable of entering into a legally binding contract under
          the Indian Contract Act, 1872 to place an order. If you are a minor, you
          may use the site only with the involvement of a parent or guardian.
        </p>
      </PolicySection>

      <PolicySection heading="2. Products and pricing">
        <p>
          All prices are listed in Indian Rupees (INR) and are inclusive of
          applicable taxes unless stated otherwise. We make reasonable efforts to
          describe products accurately, but colours and finishes may vary slightly
          due to display and manufacturing differences. We reserve the right to
          correct pricing or listing errors and to limit order quantities.
        </p>
      </PolicySection>

      <PolicySection heading="3. Orders and payment">
        <p>
          An order is confirmed only after successful payment is verified. Payments
          are processed by our third-party payment gateway; we do not store your
          payment credentials. We may cancel an order in cases of suspected fraud,
          pricing errors, or stock unavailability, in which case any amount paid
          will be refunded.
        </p>
      </PolicySection>

      <PolicySection heading="4. Shipping, returns and refunds">
        <p>
          Delivery timelines, returns, and refunds are governed by our{' '}
          <a className="underline" href="/legal/shipping">
            Shipping Policy
          </a>{' '}
          and{' '}
          <a className="underline" href="/legal/refunds">
            Returns &amp; Refund Policy
          </a>
          .
        </p>
      </PolicySection>

      <PolicySection heading="5. Intellectual property">
        <p>
          All content on this site — including designs, slogans, artwork, logos,
          and text — is owned by or licensed to {brand} and is protected by
          applicable intellectual property laws. You may not reproduce or use it
          without prior written permission.
        </p>
      </PolicySection>

      <PolicySection heading="6. Acceptable use">
        <p>
          You agree not to misuse the site, attempt unauthorised access, or use it
          for any unlawful purpose. We may suspend access where we reasonably
          believe these terms have been breached.
        </p>
      </PolicySection>

      <PolicySection heading="7. Limitation of liability">
        <p>
          To the extent permitted by law, our liability arising out of any order is
          limited to the amount paid for that order. Nothing in these terms
          excludes liability that cannot be excluded under applicable law.
        </p>
      </PolicySection>

      <PolicySection heading="8. Governing law">
        <p>
          These terms are governed by the laws of India, and the courts at{' '}
          <Placeholder value={config.sellerState()} label="SELLER_STATE" /> shall
          have jurisdiction, subject to applicable law.
        </p>
      </PolicySection>

      <PolicySection heading="9. Contact">
        <p>
          Questions about these terms can be sent via our{' '}
          <a className="underline" href="/legal/contact">
            Contact Us
          </a>{' '}
          page.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
