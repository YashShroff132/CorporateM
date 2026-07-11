/**
 * /shop — server-rendered catalog page (Shop_UI).
 *
 * Parses filter/sort/page params from the URL (ignoring invalid ones), fetches
 * PUBLISHED products through the isolated data-access layer, applies the
 * AND-combined filters + sort + 24/page pagination, and renders the first
 * (requested) page on the server (Req 2.4, 2.5, 2.6, 2.8). The default sort is
 * "newest" (Req 2.2). When nothing matches, the empty-state message renders
 * while the filter controls stay visible (Req 2.7). Canonical and rel prev/next
 * links are emitted via `generateMetadata` (Req 2.8, 19.2).
 */

import type { Metadata } from 'next';

import { ShopView } from '@/components/shop/ShopView';
import { getPublishedShopProducts } from '@/server/shop-data';
import { buildShopMetadata } from '@/server/shop-metadata';
import {
  facetValues,
  toURLSearchParams,
  type RawSearchParams,
} from '@/server/search-params';
import { encodeShopQuery, getShopPage, parseShopQuery } from '@/services/shop';

// Rendered per request so filter/sort/page URLs always reflect fresh catalog
// data (SSR, Req 2.4). ISR can be layered on later without changing this logic.
export const dynamic = 'force-dynamic';

const SHOP_PATH = '/shop';

interface ShopPageProps {
  searchParams: Promise<RawSearchParams>;
}

export async function generateMetadata({
  searchParams,
}: ShopPageProps): Promise<Metadata> {
  const raw = await searchParams;
  const query = parseShopQuery(toURLSearchParams(raw));
  const products = await getPublishedShopProducts();
  const page = getShopPage(products, query);

  return buildShopMetadata({
    path: SHOP_PATH,
    query,
    page,
    title: 'Shop',
    description:
      'Browse the full Out of Office catalog. Filter by tier, collection, color, size, and price.',
  });
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const raw = await searchParams;
  const query = parseShopQuery(toURLSearchParams(raw));

  const products = await getPublishedShopProducts();
  const page = getShopPage(products, query);
  const { colors, sizes } = facetValues(products);

  return (
    <ShopView
      heading="Shop"
      intro="Currently unavailable and permanently out of office."
      basePath={SHOP_PATH}
      baseQuery={encodeShopQuery(query)}
      query={query}
      page={page}
      colors={colors}
      sizes={sizes}
    />
  );
}
