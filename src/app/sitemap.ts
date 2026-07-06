/**
 * XML sitemap (Req 19.3, 19.7).
 *
 * Emits the static marketing/browsing routes plus one entry per active
 * collection and per PUBLISHED product, sourced through the isolated
 * `shop-data` layer. Only published/active items are listed (Req 19.3); the
 * data layer already scopes products to PUBLISHED and returns `[]` when the
 * database is unavailable, so the sitemap degrades to the static routes only
 * rather than throwing during `next build` or a first request.
 *
 * Next.js regenerates this route whenever it is requested (it is dynamic by
 * default in the App Router), so a change to a product's or collection's
 * publish state is reflected on the next fetch, well within the 300s bound
 * (Req 19.7).
 */

import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/site';
import { getActiveCollections, getPublishedShopProducts } from '@/server/shop-data';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static routes always present regardless of database availability.
  const staticEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/shop'), lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    {
      url: absoluteUrl('/collections'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ];

  // Collection + product entries degrade to nothing when the DB is down: each
  // data function returns [] on failure (Req 19.3 — exclude non-published).
  const [collections, products] = await Promise.all([
    getActiveCollections(),
    getPublishedShopProducts(),
  ]);

  const collectionEntries: MetadataRoute.Sitemap = collections.map((c) => ({
    url: absoluteUrl(`/collections/${c.slug}`),
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const productEntries: MetadataRoute.Sitemap = products.map((p) => ({
    url: absoluteUrl(`/product/${p.slug}`),
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticEntries, ...collectionEntries, ...productEntries];
}
