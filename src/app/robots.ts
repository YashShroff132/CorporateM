/**
 * robots.txt (Req 19.3 companion).
 *
 * Allows general crawling, disallows the admin panel and API routes (which
 * carry no SEO value and should not be indexed), and points crawlers at the
 * generated XML sitemap. The sitemap URL is absolute, resolved from the
 * configured site origin.
 */

import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
