/**
 * Shipping Policy (Requirement 21.1/21.2/21.6).
 *
 * Dispatch time and shipping charges/thresholds are read from configuration
 * (Owner_Input / env) so the policy matches actual store settings.
 */

import type { Metadata } from 'next';

import { PolicyPage, PolicySection, Placeholder } from '@/components/legal/PolicyPage';
import { absoluteUrl } from '@/lib/site';
import { toINRString, makePaise } from '@/lib/money';
import { config } from '@/services/config';

/** Format an integer-paise amount as ₹ INR, falling back to ₹0.00 on bad data. */
function inr(paise: number): string {
  const validated = makePaise(paise);
  return `₹${validated.ok ? toINRString(validated.value) : '0.00'}`;
}

export const metadata: Metadata = {
  title: 'Shipping Policy',
  description: 'Dispatch times, coverage, and shipping charges for Corporate Cult orders.',
  alternates: { canonical: absoluteUrl('/legal/shipping') },
};

export default function ShippingPage() {
  const brand = config.brand().name || 'Corporate Cult';
  const dispatchTime = config.dispatchTime();
  const freeThreshold = inr(config.freeShippingThreshold());
  const flatCharge = inr(config.flatShippingCharge());

  return (
    <PolicyPage title="Shipping Policy">
      <p>
        This policy describes how {brand} dispatches and delivers orders across
        India.
      </p>

      <PolicySection heading="1. Dispatch time">
        <p>
          Orders are typically processed and dispatched within{' '}
          <Placeholder value={dispatchTime} label="DISPATCH_TIME" /> after payment
          confirmation. You will receive tracking details once your order ships.
        </p>
      </PolicySection>

      <PolicySection heading="2. Delivery coverage and timelines">
        <p>
          We ship to serviceable pincodes across India through our courier
          partners. Estimated delivery is usually 3–7 business days after dispatch,
          depending on your location. Remote areas may take longer.
        </p>
      </PolicySection>

      <PolicySection heading="3. Shipping charges">
        <p>
          A flat shipping charge of {flatCharge} applies to orders below{' '}
          {freeThreshold}. Orders at or above {freeThreshold} qualify for free
          shipping. Applicable charges are shown at checkout before payment.
        </p>
      </PolicySection>

      <PolicySection heading="4. Delays">
        <p>
          Delivery timelines are estimates and may be affected by events outside
          our control, such as weather, courier disruptions, or public holidays. We
          will keep you informed of any significant delay.
        </p>
      </PolicySection>

      <PolicySection heading="5. Incorrect address">
        <p>
          Please ensure your shipping address and contact number are accurate.
          Orders returned to us due to an incorrect address or repeated failed
          delivery attempts may incur re-shipping charges.
        </p>
      </PolicySection>

      <PolicySection heading="6. Contact">
        <p>
          For shipping-related questions, reach us via our{' '}
          <a className="underline" href="/legal/contact">
            Contact Us
          </a>{' '}
          page.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
