import type { Metadata } from 'next';
import './globals.css';
import { Analytics } from '@/components/Analytics';
import { getSiteOrigin } from '@/lib/site';

const SITE_NAME = 'Out of Office';
const SITE_DESCRIPTION = 'Currently unavailable and permanently out of office.';

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

import { StoreLayoutWrapper } from '@/components/StoreLayoutWrapper';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.theme === 'light') {
                  document.documentElement.classList.remove('dark');
                } else {
                  document.documentElement.classList.add('dark');
                }
              } catch (_) {
                document.documentElement.classList.add('dark');
              }
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '1394483172629856');
              fbq('track', 'PageView');
            `,
          }}
        />
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src="https://www.facebook.com/tr?id=1394483172629856&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
      </head>
      <body className="bg-paper text-ink antialiased">
        <StoreLayoutWrapper>
          {children}
        </StoreLayoutWrapper>
        <Analytics />
      </body>
    </html>
  );
}
