import type { Metadata } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Analytics } from '@/components/Analytics';
import { getSiteOrigin } from '@/lib/site';

const SITE_NAME = 'Out of Office';
const SITE_DESCRIPTION = 'Currently unavailable. Permanently comfortable.';

/**
 * Default site metadata (Req 19.2, 19.6, 19.7).
 *
 * `metadataBase` resolves relative canonical/OG URLs against the configured
 * public site origin. Default Open Graph + Twitter card tags apply to every
 * page unless a route's `generateMetadata` overrides them. Title/description
 * stay within the SEO bounds (title <= 60, description <= 160).
 */
export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
  // Plain default title (no template): child pages already emit fully-formed
  // titles that include the brand suffix, so a template would double it.
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-paper text-ink antialiased">
        <SiteHeader />
        {children}
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
