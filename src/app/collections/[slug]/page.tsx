/**
 * /collections/[slug] — collection landing page. Displays PUBLISHED products
 * belonging to the collection (Req 2.9), reusing the same faceted filter/sort/
 * pagination logic as /shop. The collection facet is fixed to the URL slug and
 * hidden from the filter controls. Emits canonical + rel prev/next links
 * (Req 2.8, 19.2) and server-renders the first page (Req 2.4, 19.1). Unknown
 * slugs return a 404.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ShopView } from '@/components/shop/ShopView';
import {
  getCollectionBySlug,
  getPublishedShopProducts,
} from '@/server/shop-data';
import { buildShopMetadata } from '@/server/shop-metadata';
import {
  facetValues,
  toURLSearchParams,
  type RawSearchParams,
} from '@/server/search-params';
import {
  encodeShopQuery,
  getShopPage,
  parseShopQuery,
  type ShopQuery,
} from '@/services/shop';

export const dynamic = 'force-dynamic';

interface CollectionPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

/**
 * Build the query for a collection view: the parsed URL query with the
 * collection facet pinned to the route slug so only that collection's products
 * are shown regardless of any `collection` URL param.
 */
function collectionQuery(raw: RawSearchParams, slug: string): ShopQuery {
  const parsed = parseShopQuery(toURLSearchParams(raw));
  return { ...parsed, collection: [slug] };
}

export async function generateMetadata({
  params,
  searchParams,
}: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (collection === null) {
    return { title: 'Collection Not Found' };
  }

  const raw = await searchParams;
  const query = collectionQuery(raw, slug);
  const products = await getPublishedShopProducts();
  const page = getShopPage(products, query);

  return buildShopMetadata({
    path: `/collections/${slug}`,
    query,
    page,
    title: collection.title,
    description: `Shop the ${collection.title} collection from Corporate Cult.`,
  });
}

export default async function CollectionPage({
  params,
  searchParams,
}: CollectionPageProps) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (collection === null) {
    notFound();
  }

  const raw = await searchParams;
  const query = collectionQuery(raw, slug);

  const products = await getPublishedShopProducts();
  const page = getShopPage(products, query);
  // Facets come from this collection's products only.
  const inCollection = products.filter((p) => p.collectionSlug === slug);
  const { colors, sizes } = facetValues(inCollection);

  return (
    <ShopView
      heading={collection.title}
      intro={`Shop the ${collection.title} collection.`}
      basePath={`/collections/${slug}`}
      baseQuery={encodeShopQuery(query)}
      query={query}
      page={page}
      colors={colors}
      sizes={sizes}
      hideTier={false}
    />
  );
}
