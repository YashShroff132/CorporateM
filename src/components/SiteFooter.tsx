/**
 * SiteFooter — site-wide footer with navigation to the storefront and all legal
 * / policy pages (Requirement 21.1: policy pages reachable from the footer on
 * every page). Razorpay's live-account review checks that Terms, Privacy,
 * Refund, Shipping, and Contact pages are reachable — these links satisfy that.
 *
 * Server-rendered plain anchors; no client JS required.
 */

import Link from 'next/link';

import { NewsletterSignup } from './NewsletterSignup';

const SHOP_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/', label: 'Home' },
  { href: '/shop', label: 'Shop' },
  { href: '/collections', label: 'Collections' },
];

const LEGAL_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/legal/privacy', label: 'Privacy Policy' },
  { href: '/legal/terms', label: 'Terms & Conditions' },
  { href: '/legal/refunds', label: 'Returns & Refunds' },
  { href: '/legal/shipping', label: 'Shipping Policy' },
  { href: '/legal/contact', label: 'Contact Us' },
];

export function SiteFooter() {
  const brand = process.env.BRAND_NAME?.trim() || 'Out of Office';
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-ink/10 bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <nav aria-label="Shop">
            <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-muted">
              Shop
            </h2>
            <ul className="flex flex-col gap-2">
              {SHOP_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm font-semibold text-ink hover:text-stamp-red"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal">
            <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-muted">
              Legal
            </h2>
            <ul className="flex flex-col gap-2">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm font-semibold text-ink hover:text-stamp-red"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <NewsletterSignup />
        </div>

        <p className="text-xs text-muted">
          © {year} {brand}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
