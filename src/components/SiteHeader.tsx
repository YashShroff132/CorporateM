/**
 * SiteHeader — minimal, on-brand top navigation with mobile hamburger menu.
 *
 * Server-rendered with a client-side mobile toggle. On desktop, nav links
 * display inline. On mobile (<768px), links collapse behind a hamburger icon.
 */

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/manifesto', label: 'Manifesto' },
  { href: '/shop', label: 'Shop' },
  { href: '/collections', label: 'Collections' },
  { href: '/cart', label: 'Cart' },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-b border-ink/10 dark:border-paper/10 bg-paper dark:bg-black sticky top-0 z-30 transition-colors duration-300">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4"
      >
        <Link
          href="/"
          className="text-xl font-black uppercase tracking-[0.25em] text-ink dark:text-paper transition-transform active:scale-95"
        >
          OOO
        </Link>

        {/* Desktop nav — hidden on mobile */}
        <ul className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm font-bold uppercase tracking-wide text-ink dark:text-paper hover:text-stamp-red dark:hover:text-highlighter transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          
          {/* Hamburger button — visible only on mobile */}
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="md:hidden flex flex-col items-center justify-center gap-[5px] w-8 h-8"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <span
              className={`block w-5 h-[2px] bg-ink dark:bg-paper transition-transform duration-300 ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`}
            />
            <span
              className={`block w-5 h-[2px] bg-ink dark:bg-paper transition-opacity duration-300 ${menuOpen ? 'opacity-0' : ''}`}
            />
            <span
              className={`block w-5 h-[2px] bg-ink dark:bg-paper transition-transform duration-300 ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`}
            />
          </button>
        </div>
      </nav>

      {/* Mobile dropdown menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out border-t border-ink/5 dark:border-paper/5 ${
          menuOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <ul className="flex flex-col gap-1 px-6 py-4 bg-paper dark:bg-black">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block py-2.5 text-sm font-bold uppercase tracking-wide text-ink dark:text-paper hover:text-stamp-red dark:hover:text-highlighter transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}
