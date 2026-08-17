/**
 * SiteFooter — site-wide footer with navigation to the storefront and all legal
 * / policy pages.
 *
 * Includes mandatory Indian e-commerce seller disclosure (Consumer Protection E-Commerce Rules 2020).
 */

import Link from 'next/link';

import { NewsletterSignup } from './NewsletterSignup';

const SHOP_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/', label: 'Home' },
  { href: '/shop#catalog', label: 'Shop' },
  { href: '/collections', label: 'Confessions' },
];

const LEGAL_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/legal/privacy', label: 'Privacy Policy' },
  { href: '/legal/terms', label: 'Terms & Conditions' },
  { href: '/legal/refunds', label: 'Returns & Refunds' },
  { href: '/legal/shipping', label: 'Shipping Policy' },
  { href: '/legal/contact', label: 'Contact Us' },
];

export function SiteFooter() {
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

        <div className="border-t border-ink/5 pt-6 flex flex-col gap-2 text-xs text-muted">
          <p className="font-semibold text-ink/80">
            Out of Office (oofo.tech)
          </p>
          <p>
            Contact: <a href="mailto:daisybusinessin@gmail.com" className="underline hover:text-ink">daisybusinessin@gmail.com</a> &middot; <a href="tel:+918291530745" className="underline hover:text-ink">+91 8291530745</a>
          </p>
          <p className="mt-1 text-[11px]">
            &copy; {year} Out of Office. All rights reserved. Prices inclusive of all applicable taxes.
          </p>
        </div>
      </div>
    </footer>
  );
}
