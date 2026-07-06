import { describe, it, expect } from 'vitest';

import { buildShopMetadata } from './shop-metadata';
import { paginate, parseShopQuery, type ShopProduct } from '@/services/shop';

function makeProducts(count: number): ShopProduct[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    tier: 'SAFE' as const,
    collectionSlug: 'core',
    colors: ['black'],
    sizes: ['M'],
    priceInr: 500,
    createdAt: new Date(2024, 0, 1, 0, i),
    unitsSold: 0,
  }));
}

describe('buildShopMetadata', () => {
  it('emits an absolute canonical URL for the current view', () => {
    const query = parseShopQuery(new URLSearchParams(''));
    const page = paginate(makeProducts(10), 1);
    const meta = buildShopMetadata({
      path: '/shop',
      query,
      page,
      title: 'Shop',
      description: 'Browse',
    });
    expect(meta.alternates?.canonical).toMatch(/^https?:\/\/.+\/shop$/);
  });

  it('omits rel prev/next on a single page', () => {
    const query = parseShopQuery(new URLSearchParams(''));
    const page = paginate(makeProducts(5), 1);
    const meta = buildShopMetadata({
      path: '/shop',
      query,
      page,
      title: 'Shop',
      description: 'Browse',
    });
    expect(meta.other?.prev).toBeUndefined();
    expect(meta.other?.next).toBeUndefined();
  });

  it('emits rel next on the first of multiple pages and prev on later pages', () => {
    const products = makeProducts(50); // 3 pages at 24/page
    const firstQuery = parseShopQuery(new URLSearchParams(''));
    const firstMeta = buildShopMetadata({
      path: '/shop',
      query: firstQuery,
      page: paginate(products, 1),
      title: 'Shop',
      description: 'Browse',
    });
    expect(firstMeta.other?.prev).toBeUndefined();
    expect(String(firstMeta.other?.next)).toContain('page=2');

    const secondQuery = parseShopQuery(new URLSearchParams('page=2'));
    const secondMeta = buildShopMetadata({
      path: '/shop',
      query: secondQuery,
      page: paginate(products, 2),
      title: 'Shop',
      description: 'Browse',
    });
    // prev to page 1 omits the page param for a clean canonical URL.
    expect(String(secondMeta.other?.prev)).toMatch(/\/shop$/);
    expect(String(secondMeta.other?.next)).toContain('page=3');
  });

  it('clamps title to 60 and description to 160 characters', () => {
    const query = parseShopQuery(new URLSearchParams(''));
    const page = paginate(makeProducts(1), 1);
    const meta = buildShopMetadata({
      path: '/shop',
      query,
      page,
      title: 'x'.repeat(120),
      description: 'y'.repeat(300),
    });
    expect(String(meta.title).length).toBeLessThanOrEqual(60);
    expect(String(meta.description).length).toBeLessThanOrEqual(160);
  });
});
