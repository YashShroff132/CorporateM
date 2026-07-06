import { describe, it, expect } from 'vitest';

import { toURLSearchParams, facetValues } from './search-params';
import { parseShopQuery } from '@/services/shop';

describe('toURLSearchParams', () => {
  it('preserves repeated params as multiple entries', () => {
    const params = toURLSearchParams({ color: ['red', 'blue'], sort: 'priceAsc' });
    expect(params.getAll('color')).toEqual(['red', 'blue']);
    expect(params.get('sort')).toBe('priceAsc');
  });

  it('skips undefined values', () => {
    const params = toURLSearchParams({ tier: undefined, page: '2' });
    expect(params.has('tier')).toBe(false);
    expect(params.get('page')).toBe('2');
  });

  it('round-trips into a parsed shop query', () => {
    const params = toURLSearchParams({ tier: 'SAFE', color: ['red', 'blue'], sort: 'priceDesc' });
    const query = parseShopQuery(params);
    expect(query.tier).toEqual(['SAFE']);
    expect(query.color).toEqual(['blue', 'red']);
    expect(query.sort).toBe('priceDesc');
  });
});

describe('facetValues', () => {
  it('collects distinct, sorted colors and sizes', () => {
    const products = [
      { colors: ['red', 'black'], sizes: ['M', 'L'] },
      { colors: ['red', 'white'], sizes: ['S', 'M'] },
    ];
    const { colors, sizes } = facetValues(products);
    expect(colors).toEqual(['black', 'red', 'white']);
    expect(sizes).toEqual(['L', 'M', 'S']);
  });

  it('returns empty arrays for no products', () => {
    const { colors, sizes } = facetValues([]);
    expect(colors).toEqual([]);
    expect(sizes).toEqual([]);
  });
});
