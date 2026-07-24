/**
 * Terms & Conditions — Out of Office (oofo.tech).
 */

import type { Metadata } from 'next';

import { PolicyPage, PolicySection } from '@/components/legal/PolicyPage';
import { absoluteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'The terms that govern your use of the Out of Office store.',
  alternates: { canonical: absoluteUrl('/legal/terms') },
};

export default function TermsPage() {
  return (
    <PolicyPage title="Terms & Conditions">
      <p className="text-xs font-bold text-muted">Last updated: 24 July 2026</p>

      <p>
        Welcome to Out of Office. These Terms &amp; Conditions (&ldquo;Terms&rdquo;) are a legally binding agreement between you and Vishal Sharad Mandhane, a sole proprietor trading as &ldquo;Out of Office&rdquo; (&ldquo;Out of Office&rdquo;, &ldquo;OOFO&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;), governing your use of oofo.tech and your purchase of products from us. By browsing this website or placing an order, you accept these Terms. If you do not agree, please do not use the site.
      </p>

      <PolicySection heading="1. Who you are buying from">
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Legal name:</strong> Vishal Sharad Mandhane (an individual / sole proprietor — Out of Office is a brand name, not a registered company)</li>
          <li><strong>Trading name:</strong> Out of Office</li>
          <li><strong>Place of business:</strong> Mumbai, Maharashtra</li>
          <li><strong>Email:</strong> <a className="underline font-bold" href="mailto:daisybusinessin@gmail.com">daisybusinessin@gmail.com</a></li>
          <li><strong>Phone:</strong> <a className="underline font-bold" href="tel:+918291530745">+91 8291530745</a></li>
        </ul>
        <p className="mt-2">
          <strong>Registration status:</strong> Out of Office is currently operated by an individual as a sole proprietorship. It is not a company registered under the Companies Act, and it is not registered under GST. Prices are inclusive of all applicable taxes, and no GST is separately charged or collected.
        </p>
      </PolicySection>

      <PolicySection heading="2. Eligibility">
        <p>
          You must be at least 18 years old and capable of entering into a legally binding contract under the Indian Contract Act, 1872. By ordering, you confirm that you meet these requirements and that the information you provide is accurate.
        </p>
      </PolicySection>

      <PolicySection heading="3. No account needed">
        <p>
          You do not need to create an account to shop with us. You browse, add items to your cart, and check out directly. We do not maintain user accounts or store login credentials.
        </p>
      </PolicySection>

      <PolicySection heading="4. Products, descriptions and pricing">
        <p>
          All products are apparel sold under the Out of Office brand. We describe them as accurately as we can, but colours and print finishes may vary slightly because of screen settings and normal manufacturing variation.
        </p>
        <p>
          All prices are shown in Indian Rupees (INR) and are inclusive of applicable taxes. The total payable, including any delivery charge, is shown at checkout before you pay.
        </p>
        <p>
          We may correct genuine pricing or listing errors, update prices, and limit order quantities at any time before an order is confirmed.
        </p>
      </PolicySection>

      <PolicySection heading="5. How ordering and payment work">
        <p>
          To buy, you place your order on this website and are then taken to our payment partner, Razorpay, to complete payment.
        </p>
        <p>
          You enter your payment and delivery details on Razorpay&rsquo;s secure checkout, not on our website. We do not see, collect, or store your card, UPI, netbanking, or wallet credentials at any point.
        </p>
        <p>
          After payment, we receive from Razorpay only what we need to serve you: confirmation that payment succeeded, an order/payment reference, and the name, contact details, and shipping address you provided so we can deliver your order.
        </p>
        <p>
          Your order is confirmed only once payment is successfully verified. Until then, no contract of sale is formed.
        </p>
        <p>
          If we cannot fulfil a confirmed order (for example, due to a stock issue, a pricing error, or suspected fraud), we may cancel it and refund any amount you paid. We will not levy a cancellation charge on you unless we ourselves have to bear an equivalent charge.
        </p>
      </PolicySection>

      <PolicySection heading="6. Shipping, returns and refunds">
        <p>
          Delivery timelines, returns, exchanges, and refunds are governed by our{' '}
          <a className="underline font-bold" href="/legal/shipping">Shipping Policy</a>{' '}
          and our{' '}
          <a className="underline font-bold" href="/legal/refunds">Returns &amp; Refund Policy</a>
          , which form part of these Terms. In line with your rights under the Consumer Protection Act, 2019, we will not refuse to take back or refund a product that is defective, not as described, or delivered late.
        </p>
      </PolicySection>

      <PolicySection heading="7. Intellectual property">
        <p>
          All content on this site — including the designs, slogans, artwork, logos, product photography, and text — belongs to Vishal Sharad Mandhane / Out of Office or is used under licence, and is protected by law. You may not copy, reproduce, resell, or reuse any of it without our prior written permission.
        </p>
      </PolicySection>

      <PolicySection heading="8. Acceptable use">
        <p>
          You agree to use the site lawfully and not to attempt unauthorised access, interfere with its operation, scrape it, or use it for any fraudulent or unlawful purpose. We may restrict or withdraw access where we reasonably believe these Terms have been breached.
        </p>
      </PolicySection>

      <PolicySection heading="9. Limitation of liability">
        <p>
          The site and products are provided on a reasonable-efforts basis. To the maximum extent permitted by law, our total liability arising out of or in connection with any order is limited to the amount you actually paid for that order. Nothing in these Terms limits any liability that cannot be limited under Indian law, including your statutory consumer rights.
        </p>
      </PolicySection>

      <PolicySection heading="10. Complaints and grievance redressal">
        <p>
          We want problems fixed quickly. For any complaint about a product, an order, or these Terms, contact:
        </p>
        <div className="mt-2 border-l-2 border-ink pl-4 space-y-1">
          <p><strong>Grievance contact:</strong> Vishal Sharad Mandhane</p>
          <p><strong>Email:</strong> <a className="underline font-bold" href="mailto:daisybusinessin@gmail.com">daisybusinessin@gmail.com</a></p>
          <p><strong>Phone:</strong> <a className="underline font-bold" href="tel:+918291530745">+91 8291530745</a></p>
        </div>
        <p className="mt-2">
          We will acknowledge your complaint within 48 hours and aim to resolve it within one month of receipt, consistent with the Consumer Protection (E-Commerce) Rules, 2020.
        </p>
      </PolicySection>

      <PolicySection heading="11. Changes to these Terms">
        <p>
          We may update these Terms from time to time. The version posted on this page at the time of your order applies to that order.
        </p>
      </PolicySection>

      <PolicySection heading="12. Governing law and jurisdiction">
        <p>
          These Terms are governed by the laws of India. Any dispute is subject to the exclusive jurisdiction of the competent courts in Mumbai, Maharashtra.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
