/**
 * Privacy Policy — Out of Office (oofo.tech).
 */

import type { Metadata } from 'next';

import { PolicyPage, PolicySection } from '@/components/legal/PolicyPage';
import { absoluteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Out of Office collects, uses, and protects your personal data.',
  alternates: { canonical: absoluteUrl('/legal/privacy') },
};

export default function PrivacyPolicyPage() {
  return (
    <PolicyPage title="Privacy Policy">
      <p className="text-xs font-bold text-muted">Last updated: 24 July 2026</p>

      <p>
        This Privacy Policy explains what personal data Vishal Sharad Mandhane, a sole proprietor trading as &ldquo;Out of Office&rdquo; (&ldquo;Out of Office&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) handles when you use oofo.tech, and how we look after it. We act as a Data Fiduciary and aim to follow India&rsquo;s Digital Personal Data Protection Act, 2023 and the Digital Personal Data Protection Rules, 2025, along with the Information Technology Act, 2000.
      </p>

      <div className="mt-2 border-l-2 border-ink pl-4 text-sm space-y-1">
        <p><strong>Contact:</strong> <a className="underline font-bold" href="mailto:daisybusinessin@gmail.com">daisybusinessin@gmail.com</a> &middot; <a className="underline font-bold" href="tel:+918291530745">+91 8291530745</a> &middot; Mumbai, Maharashtra</p>
      </div>

      <PolicySection heading="1. The short version">
        <ul className="list-disc pl-6 space-y-1">
          <li>We collect only what we need to send you your order and, if you ask for it, our newsletter.</li>
          <li>We never see or store your payment details — those are handled entirely by Razorpay on its own secure checkout.</li>
          <li>We don&rsquo;t sell your data. We share it only with the couriers and service providers who help deliver your order.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="2. What we collect">
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>To fulfil your order:</strong> your name, contact details, and shipping address. You enter these on Razorpay&rsquo;s checkout, and Razorpay passes to us what is needed to ship your order, along with confirmation of payment and an order reference.</li>
          <li><strong>Payment information:</strong> collected and processed by Razorpay, not by us. We do not receive or store your card, UPI, netbanking, or wallet details.</li>
          <li><strong>Newsletter:</strong> your email address, only if you choose to subscribe.</li>
          <li><strong>Technical data:</strong> basic information such as device, browser, IP address, and how you use the site, collected through cookies and similar technologies to keep the site and cart working and to understand usage.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="3. Why we use it">
        <p>We use your personal data only for the purpose for which it was given:</p>
        <ul className="list-disc pl-6 space-y-1 mt-1">
          <li>To process, ship, and deliver your order, and to handle any return or refund;</li>
          <li>To contact you about your order;</li>
          <li>To send you marketing emails only if you opted in (you can unsubscribe any time);</li>
          <li>To run, secure, and improve the website; and</li>
          <li>To meet our legal and tax record-keeping obligations.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="4. Our legal basis: your consent">
        <p>
          We rely on your consent, taken through a clear, unticked, affirmative action, with the purpose made clear at the time. You can withdraw consent whenever you like by emailing <a className="underline font-bold" href="mailto:daisybusinessin@gmail.com">daisybusinessin@gmail.com</a> — it&rsquo;s as easy to withdraw as it was to give. Withdrawal doesn&rsquo;t undo processing already done, or processing we&rsquo;re legally required to keep (like invoice records).
        </p>
      </PolicySection>

      <PolicySection heading="5. Who we share it with">
        <p>We share personal data only with the partners who help us run the store, and only as far as needed:</p>
        <ul className="list-disc pl-6 space-y-1 mt-1">
          <li>Razorpay, our payment gateway, to take payment;</li>
          <li>Courier and logistics partners, to deliver your order;</li>
          <li>Hosting, email, and IT providers, to run the site and send order updates.</li>
        </ul>
        <p className="mt-2">
          We may disclose data if the law or a lawful authority requires it. We do not sell your personal data.
        </p>
      </PolicySection>

      <PolicySection heading="6. Cookies">
        <p>
          We use cookies to keep your cart working, remember basic preferences, and understand how the site is used. You can manage or block cookies in your browser; some features, including checkout, may not work properly if you disable them.
        </p>
      </PolicySection>

      <PolicySection heading="7. How long we keep it">
        <p>
          We keep your data only as long as needed for the purposes above and for any period the law requires (for example, for tax and accounting). After that we delete or anonymise it.
        </p>
      </PolicySection>

      <PolicySection heading="8. Keeping it safe">
        <p>
          We take reasonable steps to protect your data. If a personal data breach affecting you occurs, we will notify you and the Data Protection Board of India as required by law.
        </p>
      </PolicySection>

      <PolicySection heading="9. Your rights">
        <p>You can ask us to:</p>
        <ul className="list-disc pl-6 space-y-1 mt-1">
          <li>Access the personal data we hold about you and how we use it;</li>
          <li>Correct, complete, or update it;</li>
          <li>Erase it (where we&rsquo;re not required to keep it);</li>
          <li>Withdraw consent; and</li>
          <li>Nominate someone to exercise your rights if you die or become incapacitated.</li>
        </ul>
        <p className="mt-2">
          To use any of these, email <a className="underline font-bold" href="mailto:daisybusinessin@gmail.com">daisybusinessin@gmail.com</a> with your request and order reference. We&rsquo;ll respond within the timelines the law sets.
        </p>
      </PolicySection>

      <PolicySection heading="10. Children">
        <p>
          Out of Office is meant for adults. We don&rsquo;t knowingly collect data from anyone under 18 without a parent&rsquo;s or guardian&rsquo;s verifiable consent, and we don&rsquo;t run tracking or targeted advertising aimed at children.
        </p>
      </PolicySection>

      <PolicySection heading="11. Grievances">
        <p>If you have any concern about how your data is handled:</p>
        <div className="mt-2 border-l-2 border-ink pl-4 space-y-1">
          <p><strong>Contact:</strong> Vishal Sharad Mandhane</p>
          <p><strong>Email:</strong> <a className="underline font-bold" href="mailto:daisybusinessin@gmail.com">daisybusinessin@gmail.com</a> &middot; <strong>Phone:</strong> <a className="underline font-bold" href="tel:+918291530745">+91 8291530745</a></p>
        </div>
        <p className="mt-2">We&rsquo;ll acknowledge within 48 hours and resolve within one month.</p>
      </PolicySection>

      <PolicySection heading="12. Updates">
        <p>
          We may update this policy. The current version, with its &ldquo;Last updated&rdquo; date, always lives on this page.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
