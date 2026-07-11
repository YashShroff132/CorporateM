/**
 * SiteHeader — minimal, on-brand top navigation with mobile hamburger menu.
 *
 * Fixed position with scroll animations:
 * - Top black announcement bar with cycling messages and cycle buttons.
 * - Transparent background when at the top of the viewport.
 * - Solid blurred background + slightly smaller animated logo on scroll.
 * - Mobile: Hamburger on left, Centered logo, Actions (theme toggle + cart) on right.
 * - Desktop: Left-aligned logo, Inline links, Actions on right.
 */

'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { ThemeToggle } from './ThemeToggle';

const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/manifesto', label: 'Manifesto' },
  { href: '/shop', label: 'Shop' },
  { href: '/collections', label: 'Collections' },
  { href: '/cart', label: 'Cart' },
];

const ANNOUNCEMENT_MESSAGES = [
  'USE CODE OOO10 FOR 10% OFF ON YOUR FIRST ORDER',
  'FREE SHIPPING NATIONWIDE ON ORDERS OVER RS. 999',
  'AUTO-REPLY ACTIVE — OUT OF OFFICE IS THE WAY',
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [announcementIdx, setAnnouncementIdx] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 30);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setAnnouncementIdx((prev) => (prev + 1) % ANNOUNCEMENT_MESSAGES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const prevAnnouncement = () => {
    setAnnouncementIdx((prev) => (prev - 1 + ANNOUNCEMENT_MESSAGES.length) % ANNOUNCEMENT_MESSAGES.length);
  };

  const nextAnnouncement = () => {
    setAnnouncementIdx((prev) => (prev + 1) % ANNOUNCEMENT_MESSAGES.length);
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-30 transition-all duration-300 border-b ${
        scrolled
          ? 'bg-paper/95 dark:bg-black/95 backdrop-blur-md border-ink/10 dark:border-white/10 shadow-sm'
          : 'bg-transparent border-transparent'
      }`}
    >
      {/* Announcement Bar Ticker */}
      <div className="bg-black text-white py-1.5 px-4 text-[9px] font-mono tracking-widest flex items-center justify-between border-b border-white/10 select-none">
        <button
          onClick={prevAnnouncement}
          className="hover:text-highlighter transition-colors p-1"
          aria-label="Previous announcement"
        >
          &lt;
        </button>
        <span className="text-center font-bold truncate px-4">{ANNOUNCEMENT_MESSAGES[announcementIdx]}</span>
        <button
          onClick={nextAnnouncement}
          className="hover:text-highlighter transition-colors p-1"
          aria-label="Next announcement"
        >
          &gt;
        </button>
      </div>

      <nav
        aria-label="Primary"
        className={`mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 transition-all duration-500 ease-in-out ${
          scrolled ? 'py-2' : 'py-6'
        }`}
      >
        {/* Mobile Left Column: Hamburger Menu Icon */}
        <div className="flex md:hidden w-1/4 justify-start">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex flex-col items-center justify-center gap-[5px] w-8 h-8 text-ink dark:text-white"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <span
              className={`block w-5 h-[2px] bg-ink dark:bg-white transition-transform duration-300 ${
                menuOpen ? 'rotate-45 translate-y-[7px]' : ''
              }`}
            />
            <span
              className={`block w-5 h-[2px] bg-ink dark:bg-white transition-opacity duration-300 ${
                menuOpen ? 'opacity-0' : ''
              }`}
            />
            <span
              className={`block w-5 h-[2px] bg-ink dark:bg-white transition-transform duration-300 ${
                menuOpen ? '-rotate-45 -translate-y-[7px]' : ''
              }`}
            />
          </button>
        </div>

        {/* Logo Column: Centered on mobile, Left-aligned on desktop */}
        <div className="flex w-2/4 md:w-auto justify-center md:justify-start">
          <Link
            href="/"
            className={`font-black uppercase text-ink dark:text-white transition-all duration-500 ease-in-out origin-center md:origin-left ${
              scrolled
                ? 'scale-75 tracking-[0.15em] opacity-90 text-lg md:text-xl'
                : 'scale-110 tracking-[0.35em] text-xl md:text-2xl'
            }`}
          >
            OOO
          </Link>
        </div>

        {/* Desktop nav — hidden on mobile */}
        <ul className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm font-bold uppercase tracking-wide text-ink dark:text-white hover:text-stamp-red dark:hover:text-highlighter transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Header Actions: Theme toggle + Cart link (Mobile & Desktop) */}
        <div className="flex w-1/4 md:w-auto justify-end items-center gap-3">
          <ThemeToggle />
          
          {/* Cart Icon Quick Link on mobile */}
          <Link
            href="/cart"
            className="md:hidden text-ink dark:text-white hover:text-stamp-red transition-colors p-1"
            aria-label="View Cart"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.2}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
          </Link>
        </div>
      </nav>

      {/* Mobile dropdown menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out border-t border-ink/5 dark:border-white/5 ${
          menuOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <ul className="flex flex-col gap-1 px-6 py-4 bg-paper dark:bg-black">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block py-2.5 text-sm font-bold uppercase tracking-wide text-ink dark:text-white hover:text-stamp-red dark:hover:text-highlighter transition-colors"
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
