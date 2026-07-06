/**
 * SiteHeader — minimal, on-brand top navigation so the storefront is navigable.
 *
 * Server-rendered plain anchors (no client JS required) linking the core
 * customer routes: Home, Shop, Collections, and Cart. Uses the brand tokens
 * from the Tailwind config (ink/paper/highlighter) to stay on-brand.
 */

import Link from 'next/link';

const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/shop', label: 'Shop' },
  { href: '/collections', label: 'Collections' },
  { href: '/cart', label: 'Cart' },
];

export function SiteHeader() {
  return (
    <header className="border-b border-ink/10 bg-paper">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4"
      >
        <Link
          href="/"
          className="text-lg font-black uppercase tracking-tight text-ink"
        >
          Corporate Cult
        </Link>
        <ul className="flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm font-bold uppercase tracking-wide text-ink hover:text-stamp-red"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
