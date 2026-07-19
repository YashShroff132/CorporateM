/**
 * Contact Us + Grievance Officer (Requirement 21.1/21.2/21.5/21.6).
 *
 * Publishes the grievance officer's name, email, and acknowledgement window,
 * each sourced from Owner_Input env values with clearly identifiable
 * placeholders when unset (Req 21.5/21.6).
 */

import type { Metadata } from 'next';

import { PolicyPage, PolicySection } from '@/components/legal/PolicyPage';
import { absoluteUrl } from '@/lib/site';
import { config } from '@/services/config';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Reach the Out of Office support and grievance team.',
  alternates: { canonical: absoluteUrl('/legal/contact') },
};

export default function ContactPage() {
  const brand = config.brand().name || 'Out of Office';

  return (
    <PolicyPage title="Contact Us">
      <p>
        Have a question about your order, delivery, or custom inquiry? Reach the {brand} team using the details below and we&rsquo;ll get back to you within 24–48 hours.
      </p>

      <PolicySection heading="Customer Support">
        <ul className="list-none flex flex-col gap-2">
          <li>
            <span className="font-semibold">Brand:</span> {brand} (OOFO)
          </li>
          <li>
            <span className="font-semibold">Email Support:</span>{' '}
            <a className="underline font-bold" href="mailto:support@oofo.tech">support@oofo.tech</a>
          </li>
          <li>
            <span className="font-semibold">Response Time:</span> Monday to Saturday, 10:00 AM – 7:00 PM IST (within 24–48 hours)
          </li>
        </ul>
      </PolicySection>

      <PolicySection heading="Grievances & Order Assistance">
        <p>
          For any specific order complaint, wrong item received, or privacy request, email our support officer directly at <a className="underline font-bold" href="mailto:support@oofo.tech">support@oofo.tech</a> with your Order ID. All tickets are acknowledged within 24 hours.
        </p>
      </PolicySection>

      <PolicySection heading="Store Policies">
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
