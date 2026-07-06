/**
 * Privacy Policy (Requirement 21.1/21.2/21.6).
 *
 * DPDP-aware template: states what data is collected, the purpose, the consent
 * basis, retention, and how to raise a data request. Brand/contact values come
 * from configuration/env; unknown Owner_Input text renders as a placeholder.
 */

import type { Metadata } from 'next';

import { PolicyPage, PolicySection, Placeholder } from '@/components/legal/PolicyPage';
import { absoluteUrl } from '@/lib/site';
import { config } from '@/services/config';

export const metadata: Metadata = {
  title: 'Privacy Policy — Corporate Cult',
  description: 'How Corporate Cult collects, uses, and protects your personal data.',
  alternates: { canonical: absoluteUrl('/legal/privacy') },
};

export default function PrivacyPolicyPage() {
  const brand = config.brand().name || 'Corporate Cult';
  const entity = config.legalEntityName();
  const supportEmail = process.env.SUPPORT_EMAIL ?? '';
  const grievanceOfficer = process.env.GRIEVANCE_OFFICER_NAME ?? '';

  return (
    <PolicyPage title="Privacy Policy">
      <p>
        This Privacy Policy explains how{' '}
        <Placeholder value={entity} label="LEGAL_ENTITY_NAME" /> (&ldquo;{brand}
        &rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, stores, and
        protects your personal data when you visit our website or place an order.
        We aim to align with India&rsquo;s Digital Personal Data Protection Act,
        2023 (DPDP Act).
      </p>

      <PolicySection heading="1. Data we collect">
        <p>We collect the following categories of personal data:</p>
        <ul className="list-disc pl-6">
          <li>Contact details you provide: name, email address, phone number.</li>
          <li>Shipping and billing address for order fulfilment and invoicing.</li>
          <li>
            Order and transaction details. Note: we do not store your card, UPI,
            or bank credentials — payments are processed by our payment gateway.
          </li>
          <li>
            Technical data such as device, browser, and usage information
            collected via cookies and similar technologies.
          </li>
        </ul>
      </PolicySection>

      <PolicySection heading="2. Purpose of collection">
        <p>We use your personal data only for the purposes for which it was collected:</p>
        <ul className="list-disc pl-6">
          <li>To process, fulfil, and deliver your orders.</li>
          <li>To generate GST-compliant tax invoices.</li>
          <li>To provide customer support and respond to your queries.</li>
          <li>To send transactional updates about your orders.</li>
          <li>To improve our website and comply with legal obligations.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="3. Consent">
        <p>
          We collect and process your personal data on the basis of the consent
          you provide at the point of collection. Consent is sought through a
          clear affirmative action that is never pre-selected, and the purpose is
          stated at that point. You may withdraw your consent at any time by
          contacting us; withdrawal does not affect processing carried out before
          withdrawal.
        </p>
      </PolicySection>

      <PolicySection heading="4. Sharing and disclosure">
        <p>
          We share personal data only with service providers who help us operate
          the store — for example, our payment gateway, logistics and courier
          partners, and communication providers — and only to the extent needed
          to perform those services. We do not sell your personal data.
        </p>
      </PolicySection>

      <PolicySection heading="5. Data retention">
        <p>
          We retain personal data only for as long as necessary to fulfil the
          purposes described above, including to meet accounting, tax, and other
          legal requirements.
        </p>
      </PolicySection>

      <PolicySection heading="6. Your rights">
        <p>
          Subject to applicable law, you may request access to, correction of, or
          erasure of your personal data, and you may withdraw consent. To make a
          request, contact us at{' '}
          <Placeholder value={supportEmail} label="SUPPORT_EMAIL" />.
        </p>
      </PolicySection>

      <PolicySection heading="7. Grievance officer">
        <p>
          In accordance with applicable law, you may address any concern about the
          processing of your personal data to our Grievance Officer,{' '}
          <Placeholder value={grievanceOfficer} label="GRIEVANCE_OFFICER_NAME" />,
          at <Placeholder value={supportEmail} label="SUPPORT_EMAIL" />. Full
          contact details are on our{' '}
          <a className="underline" href="/legal/contact">
            Contact Us
          </a>{' '}
          page.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
