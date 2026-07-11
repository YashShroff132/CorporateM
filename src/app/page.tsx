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

export const dynamic = 'force-dynamic';

const SHOP_PATH = '/';

interface HomePageProps {
  searchParams: Promise<RawSearchParams>;
}

export async function generateMetadata({
  searchParams,
}: HomePageProps): Promise<Metadata> {
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

export default async function HomePage({ searchParams }: HomePageProps) {
  const raw = await searchParams;
  const query = parseShopQuery(toURLSearchParams(raw));

  const products = await getPublishedShopProducts();
  const page = getShopPage(products, query);
  const { colors, sizes } = facetValues(products);

  return (
    <ShopView
      heading=""
      basePath={SHOP_PATH}
      baseQuery={encodeShopQuery(query)}
      query={query}
      page={page}
      colors={colors}
      sizes={sizes}
    />
  );
}
