/**
 * Contact Us + Grievance Officer — Out of Office (oofo.tech).
 */

import type { Metadata } from 'next';

import { PolicyPage, PolicySection } from '@/components/legal/PolicyPage';
import { absoluteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Reach the Out of Office support and grievance team.',
  alternates: { canonical: absoluteUrl('/legal/contact') },
};

export default function ContactPage() {
  return (
    <PolicyPage title="Contact Us">
      <p>
        Have a question about your order, delivery, or custom inquiry? Reach the Out of Office team using the details below and we&rsquo;ll get back to you within 24–48 hours.
      </p>

      <PolicySection heading="Customer Support">
        <ul className="list-none flex flex-col gap-2">
          <li>
            <span className="font-semibold">Legal Entity:</span> Vishal Sharad Mandhane (Sole Proprietorship trading as &ldquo;Out of Office&rdquo;)
          </li>
          <li>
            <span className="font-semibold">Place of Business:</span> Mumbai, Maharashtra
          </li>
          <li>
            <span className="font-semibold">Email Support:</span>{' '}
            <a className="underline font-bold" href="mailto:daisybusinessin@gmail.com">daisybusinessin@gmail.com</a>
          </li>
          <li>
            <span className="font-semibold">Phone Support:</span>{' '}
            <a className="underline font-bold" href="tel:+918291530745">+91 8291530745</a>
          </li>
          <li>
            <span className="font-semibold">Response Time:</span> Monday to Saturday, 10:00 AM – 7:00 PM IST (acknowledged within 48 hours)
          </li>
        </ul>
      </PolicySection>

      <PolicySection heading="Grievances & Order Assistance">
        <p>
          For any specific order complaint, wrong item received, or privacy request, contact Grievance Officer <strong>Vishal Sharad Mandhane</strong> at <a className="underline font-bold" href="mailto:daisybusinessin@gmail.com">daisybusinessin@gmail.com</a> or <a className="underline font-bold" href="tel:+918291530745">+91 8291530745</a> with your Order ID. All tickets are acknowledged within 48 hours and resolved within one month in accordance with the Consumer Protection (E-Commerce) Rules, 2020.
        </p>
      </PolicySection>

      <PolicySection heading="Store Policies">
        <p>
          Please also review our{' '}
          <a className="underline font-bold" href="/legal/privacy">
            Privacy Policy
          </a>
          ,{' '}
          <a className="underline font-bold" href="/legal/terms">
            Terms &amp; Conditions
          </a>
          ,{' '}
          <a className="underline font-bold" href="/legal/refunds">
            Returns &amp; Refund Policy
          </a>
          , and{' '}
          <a className="underline font-bold" href="/legal/shipping">
            Shipping Policy
          </a>
          .
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
