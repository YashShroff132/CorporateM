/**
 * Contact Us + Grievance Officer (Requirement 21.1/21.2/21.5/21.6).
 *
 * Publishes the grievance officer's name, email, and acknowledgement window,
 * each sourced from Owner_Input env values with clearly identifiable
 * placeholders when unset (Req 21.5/21.6).
 */

import type { Metadata } from 'next';

import { PolicyPage, PolicySection, Placeholder } from '@/components/legal/PolicyPage';
import { absoluteUrl } from '@/lib/site';
import { config } from '@/services/config';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Reach the Corporate Cult support and grievance team.',
  alternates: { canonical: absoluteUrl('/legal/contact') },
};

export default function ContactPage() {
  const brand = config.brand().name || 'Corporate Cult';
  const entity = config.legalEntityName();
  const supportEmail = process.env.SUPPORT_EMAIL ?? '';
  const businessAddress =
    process.env.BUSINESS_ADDRESS ?? config.legalEntityAddress();
  const grievanceOfficer = process.env.GRIEVANCE_OFFICER_NAME ?? '';
  const ackWindow = process.env.GRIEVANCE_ACK_HOURS ?? '';

  return (
    <PolicyPage title="Contact Us">
      <p>
        We&rsquo;d love to hear from you. Reach the {brand} team using the details
        below and we&rsquo;ll get back to you as soon as we can.
      </p>

      <PolicySection heading="Customer support">
        <ul className="list-none flex flex-col gap-1">
          <li>
            <span className="font-semibold">Business:</span>{' '}
            <Placeholder value={entity} label="LEGAL_ENTITY_NAME" />
          </li>
          <li>
            <span className="font-semibold">Email:</span>{' '}
            <Placeholder value={supportEmail} label="SUPPORT_EMAIL" />
          </li>
          <li>
            <span className="font-semibold">Address:</span>{' '}
            <Placeholder value={businessAddress} label="BUSINESS_ADDRESS" />
          </li>
        </ul>
      </PolicySection>

      <PolicySection heading="Grievance officer">
        <p>
          In line with applicable Indian law, including the Consumer Protection
          (E-Commerce) Rules and the DPDP Act, you may contact our Grievance
          Officer for any complaint regarding our services or the handling of your
          personal data.
        </p>
        <ul className="list-none flex flex-col gap-1">
          <li>
            <span className="font-semibold">Name:</span>{' '}
            <Placeholder value={grievanceOfficer} label="GRIEVANCE_OFFICER_NAME" />
          </li>
          <li>
            <span className="font-semibold">Email:</span>{' '}
            <Placeholder value={supportEmail} label="SUPPORT_EMAIL" />
          </li>
          <li>
            <span className="font-semibold">Address:</span>{' '}
            <Placeholder value={businessAddress} label="BUSINESS_ADDRESS" />
          </li>
          <li>
            <span className="font-semibold">Acknowledgement window:</span> We aim
            to acknowledge grievances within{' '}
            <Placeholder value={ackWindow} label="GRIEVANCE_ACK_HOURS" /> hours and
            resolve them within a reasonable time as required by law.
          </li>
        </ul>
      </PolicySection>

      <PolicySection heading="Policies">
        <p>
          Please also review our{' '}
          <a className="underline" href="/legal/privacy">
            Privacy Policy
          </a>
          ,{' '}
          <a className="underline" href="/legal/terms">
            Terms &amp; Conditions
          </a>
          ,{' '}
          <a className="underline" href="/legal/refunds">
            Returns &amp; Refund Policy
          </a>
          , and{' '}
          <a className="underline" href="/legal/shipping">
            Shipping Policy
          </a>
          .
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
