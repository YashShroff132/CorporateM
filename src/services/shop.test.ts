import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { TIERS, type Tier } from './catalog';
import {
  PAGE_SIZE,
  SORTS,
  applyFilters,
  createShopQueryParser,
  encodeShopQuery,
  getShopPage,
  paginate,
  parseShopQuery,
  type ShopProduct,
  type ShopQuery,
  type Sort,
} from './shop';

/**
 * Property tests for the Shop_UI query, filtering, and pagination logic
 * (task 4.2). These exercise the universal properties defined in design.md for
 * Requirement 2 using fast-check. Concrete examples live alongside as unit
 * tests so both specific and universal behaviour are covered.
 */

// ---------------------------------------------------------------------------
// Custom generators
// ---------------------------------------------------------------------------

/**
 * Canonical form used by the parser: de-duplicated and lexicographically
 * sorted, matching `canonicalize` in shop.ts so generated queries line up with
 * whatever `parse` produces.
 */
function canon(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * A facet token: non-empty, lowercase alphanumeric so it never contains a comma
 * (the encode/parse delimiter) or surrounding whitespace (which parse trims),
 * and never collides with an uppercase tier value.
 */
const tokenArb = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
    minLength: 1,
    maxLength: 8,
  })
  .map((chars) => chars.join(''));

/** A canonical, possibly-empty list of facet tokens. */
const facetArb = fc.array(tokenArb, { maxLength: 4 }).map(canon);

/** An optional integer INR price within the allowed 0..999,999 range. */
const priceArb = fc.option(fc.integer({ min: 0, max: 999_999 }), { nil: undefined });

/**
 * A ShopQuery in the exact canonical shape `parseShopQuery` returns: array
 * facets present only when non-empty, prices present only when set, and a
 * concrete sort/page. This lets `parse(encode(q))` be compared with `q`
 * directly.
 */
const shopQueryArb: fc.Arbitrary<ShopQuery> = fc
  .record({
    tier: fc.subarray([...TIERS]).map((t) => canon(t) as Tier[]),
    collection: facetArb,
    color: facetArb,
    size: facetArb,
    priceMinInr: priceArb,
    priceMaxInr: priceArb,
    sort: fc.constantFrom<Sort>(...SORTS),
    page: fc.integer({ min: 1, max: 1000 }),
  })
  .map((r) => {
    const query: ShopQuery = { sort: r.sort, page: r.page };
    if (r.tier.length > 0) query.tier = r.tier;
    if (r.collection.length > 0) query.collection = r.collection;
    if (r.color.length > 0) query.color = r.color;
    if (r.size.length > 0) query.size = r.size;
    if (r.priceMinInr !== undefined) query.priceMinInr = r.priceMinInr;
    if (r.priceMaxInr !== undefined) query.priceMaxInr = r.priceMaxInr;
    return query;
  });

/** A ShopProduct with the fields the browsing logic filters and sorts on. */
const productDataArb = fc.record({
  tier: fc.constantFrom<Tier>(...TIERS),
  collectionSlug: tokenArb,
  colors: fc.array(tokenArb, { minLength: 1, maxLength: 3 }),
  sizes: fc.array(tokenArb, { minLength: 1, maxLength: 3 }),
  priceInr: fc.integer({ min: 0, max: 999_999 }),
  createdAt: fc.date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2030-01-01T00:00:00Z') }),
  unitsSold: fc.nat({ max: 100_000 }),
});

/** A list of products with guaranteed-unique ids so results compare by id. */
const productsArb: fc.Arbitrary<ShopProduct[]> = fc
  .array(productDataArb, { maxLength: 60 })
  .map((rows) => rows.map((row, i) => ({ id: `p-${i}`, ...row })));

/**
 * Independent reference implementation of the AND filter semantics from
 * Req 2.5, written from the requirement rather than from shop.ts so the test
 * can catch a divergence in the implementation.
 */
function referenceMatch(product: ShopProduct, query: ShopQuery): boolean {
  if (query.tier && query.tier.length > 0 && !query.tier.includes(product.tier)) return false;
  if (
    query.collection &&
    query.collection.length > 0 &&
    !query.collection.includes(product.collectionSlug)
  ) {
    return false;
  }
  if (
    query.color &&
    query.color.length > 0 &&
    !product.colors.some((c) => query.color!.includes(c))
  ) {
    return false;
  }
  if (query.size && query.size.length > 0 && !product.sizes.some((s) => query.size!.includes(s))) {
    return false;
  }
  if (query.priceMinInr !== undefined && product.priceInr < query.priceMinInr) return false;
  if (query.priceMaxInr !== undefined && product.priceInr > query.priceMaxInr) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Property 5: Shop query encode/parse round trip (Req 2.3)
// ---------------------------------------------------------------------------

describe('Shop query — Property 5: encode/parse round trip', () => {
  // Feature: corporate-cult-ecommerce, Property 5: Shop query encode/parse round trip —
  // For any valid ShopQuery, encoding it to URL parameters and parsing the result yields an
  // equivalent ShopQuery.
  // Validates: Requirements 2.3
  it('parse(encode(query)) equals the original canonical query', () => {
    fc.assert(
      fc.property(shopQueryArb, (query) => {
        const encoded = encodeShopQuery(query);
        const roundTripped = parseShopQuery(new URLSearchParams(encoded));
        expect(roundTripped).toEqual(query);
      }),
      { numRuns: 300 },
    );
  });

  it('round trips through the parser factory as well', () => {
    const parser = createShopQueryParser();
    fc.assert(
      fc.property(shopQueryArb, (query) => {
        const roundTripped = parser.parse(new URLSearchParams(parser.encode(query)));
        expect(roundTripped).toEqual(query);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Invalid shop parameters are ignored (Req 2.6)
// ---------------------------------------------------------------------------

describe('Shop query — Property 6: invalid parameters are ignored', () => {
  // Feature: corporate-cult-ecommerce, Property 6: Invalid shop parameters are ignored —
  // For any valid ShopQuery with arbitrary unrecognized, malformed, or out-of-range parameters
  // injected, parsing the polluted parameters yields the same ShopQuery as parsing the clean
  // parameters (invalid parameters discarded, valid ones retained).
  // Validates: Requirements 2.6

  const RESERVED = new Set([
    'tier',
    'collection',
    'color',
    'size',
    'priceMin',
    'priceMax',
    'sort',
    'page',
  ]);

  // Unrecognized param keys (prefixed so they never clash with a reserved name).
  const noiseKeyArb = tokenArb.map((t) => `z_${t}`);
  const noisePairArb = fc.tuple(noiseKeyArb, fc.string());

  // Values that are always rejected for the numeric/sort/page params.
  const malformedPriceArb = fc.constantFrom('abc', '-1', '1.5', '1000000000', '', ' ', '12px');
  const malformedPageArb = fc.constantFrom('0', '-1', 'abc', '1.5', '', ' ', '3.0');
  // Lowercase alnum tokens can never equal a valid (uppercase) tier or sort.
  const invalidSortArb = tokenArb;
  const invalidTierArb = tokenArb;

  it('parsing polluted parameters equals parsing the clean parameters', () => {
    fc.assert(
      fc.property(
        shopQueryArb,
        fc.array(noisePairArb, { maxLength: 6 }),
        fc.array(malformedPriceArb, { maxLength: 3 }),
        fc.array(malformedPageArb, { maxLength: 3 }),
        fc.array(invalidSortArb, { maxLength: 3 }),
        fc.array(invalidTierArb, { maxLength: 3 }),
        (query, noisePairs, badPrices, badPages, badSorts, badTiers) => {
          const clean = new URLSearchParams(encodeShopQuery(query));
          const polluted = new URLSearchParams(clean.toString());

          // Unrecognized keys are always ignored.
          for (const [k, v] of noisePairs) {
            if (!RESERVED.has(k)) polluted.append(k, v);
          }
          // Malformed values appended to recognized params. Because encode wrote
          // any real value first, `parse` (which reads the first value) keeps the
          // clean value; where the query had no value, these are rejected.
          for (const v of badPrices) {
            polluted.append('priceMin', v);
            polluted.append('priceMax', v);
          }
          for (const v of badPages) polluted.append('page', v);
          for (const v of badSorts) polluted.append('sort', v);
          for (const v of badTiers) polluted.append('tier', v);

          const fromClean = parseShopQuery(clean);
          const fromPolluted = parseShopQuery(polluted);
          expect(fromPolluted).toEqual(fromClean);
          // And both still equal the original query (ties back to Property 5).
          expect(fromPolluted).toEqual(query);
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Filters combine with AND (Req 2.5)
// ---------------------------------------------------------------------------

describe('Shop query — Property 7: filters combine with AND', () => {
  // Feature: corporate-cult-ecommerce, Property 7: Filters combine with AND —
  // For any product set and set of active filters, every product in the results satisfies every
  // active filter, and no product satisfying all active filters within the first page window is
  // omitted.
  // Validates: Requirements 2.5
  it('returns exactly the products satisfying every active facet', () => {
    fc.assert(
      fc.property(productsArb, shopQueryArb, (products, query) => {
        const result = applyFilters(products, query);
        const resultIds = new Set(result.map((p) => p.id));

        // Soundness: every returned product satisfies every active filter.
        for (const p of result) {
          if (query.tier && query.tier.length > 0) expect(query.tier).toContain(p.tier);
          if (query.collection && query.collection.length > 0) {
            expect(query.collection).toContain(p.collectionSlug);
          }
          if (query.color && query.color.length > 0) {
            expect(p.colors.some((c) => query.color!.includes(c))).toBe(true);
          }
          if (query.size && query.size.length > 0) {
            expect(p.sizes.some((s) => query.size!.includes(s))).toBe(true);
          }
          if (query.priceMinInr !== undefined) {
            expect(p.priceInr).toBeGreaterThanOrEqual(query.priceMinInr);
          }
          if (query.priceMaxInr !== undefined) {
            expect(p.priceInr).toBeLessThanOrEqual(query.priceMaxInr);
          }
        }

        // Completeness: no product satisfying all active filters is omitted.
        const expectedIds = products.filter((p) => referenceMatch(p, query)).map((p) => p.id);
        expect([...resultIds].sort()).toEqual(expectedIds.sort());
      }),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Pagination page-size invariant (Req 2.8)
// ---------------------------------------------------------------------------

describe('Shop query — Property 8: pagination page-size invariant', () => {
  // Feature: corporate-cult-ecommerce, Property 8: Pagination page-size invariant —
  // For any catalog and page number, the returned page contains at most 24 products, and
  // rel-prev/rel-next links are present exactly when a previous/next page exists.
  // Validates: Requirements 2.8
  it('caps a page at 24 items with prev/next reflecting adjacent pages', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 130 }),
        fc.integer({ min: -5, max: 250 }),
        (items, requestedPage) => {
          const page = paginate(items, requestedPage);

          expect(page.pageSize).toBe(PAGE_SIZE);
          expect(page.items.length).toBeLessThanOrEqual(PAGE_SIZE);
          expect(page.totalItems).toBe(items.length);

          const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
          expect(page.totalPages).toBe(totalPages);

          // Requested page is clamped into [1, totalPages].
          const expectedCurrent = Math.min(Math.max(1, Math.floor(requestedPage)), totalPages);
          expect(page.page).toBe(expectedCurrent);

          // rel-prev/rel-next exist exactly when an adjacent page exists.
          expect(page.hasPrev).toBe(expectedCurrent > 1);
          expect(page.hasNext).toBe(expectedCurrent < totalPages);

          // A non-final page is exactly full; the final page carries the remainder.
          if (expectedCurrent < totalPages) {
            expect(page.items.length).toBe(PAGE_SIZE);
          } else if (items.length > 0) {
            const remainder = items.length - (totalPages - 1) * PAGE_SIZE;
            expect(page.items.length).toBe(remainder);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('holds end-to-end through getShopPage for filtered catalogs', () => {
    fc.assert(
      fc.property(productsArb, shopQueryArb, (products, query) => {
        const page = getShopPage(products, query);
        const matchCount = products.filter((p) => referenceMatch(p, query)).length;
        const totalPages = Math.max(1, Math.ceil(matchCount / PAGE_SIZE));

        expect(page.items.length).toBeLessThanOrEqual(PAGE_SIZE);
        expect(page.totalItems).toBe(matchCount);
        expect(page.totalPages).toBe(totalPages);
        expect(page.hasPrev).toBe(page.page > 1);
        expect(page.hasNext).toBe(page.page < totalPages);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Concrete examples (unit tests)
// ---------------------------------------------------------------------------

describe('Shop query — concrete examples', () => {
  it('omits default sort and first page from the encoded URL', () => {
    expect(encodeShopQuery({ sort: 'newest', page: 1 })).toBe('');
    expect(encodeShopQuery({ sort: 'priceAsc', page: 2 })).toBe('sort=priceAsc&page=2');
  });

  it('ignores unrecognized, malformed, and out-of-range parameters', () => {
    const params = new URLSearchParams(
      'tier=SAFE&tier=BOGUS&priceMin=-5&priceMax=abc&sort=random&page=0&mystery=1',
    );
    expect(parseShopQuery(params)).toEqual({ tier: ['SAFE'], sort: 'newest', page: 1 });
  });

  it('combines tier and price facets with AND', () => {
    const products: ShopProduct[] = [
      {
        id: 'a',
        tier: 'SAFE',
        collectionSlug: 'ops',
        colors: ['black'],
        sizes: ['m'],
        priceInr: 500,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        unitsSold: 0,
      },
      {
        id: 'b',
        tier: 'DIRECT',
        collectionSlug: 'ops',
        colors: ['black'],
        sizes: ['m'],
        priceInr: 500,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        unitsSold: 0,
      },
      {
        id: 'c',
        tier: 'SAFE',
        collectionSlug: 'ops',
        colors: ['black'],
        sizes: ['m'],
        priceInr: 2000,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        unitsSold: 0,
      },
    ];
    const result = applyFilters(products, {
      tier: ['SAFE'],
      priceMaxInr: 1000,
      sort: 'newest',
      page: 1,
    });
    expect(result.map((p) => p.id)).toEqual(['a']);
  });

  it('paginates at 24 with correct prev/next at the boundaries', () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const first = paginate(items, 1);
    expect(first.items.length).toBe(24);
    expect(first.hasPrev).toBe(false);
    expect(first.hasNext).toBe(true);

    const second = paginate(items, 2);
    expect(second.items.length).toBe(1);
    expect(second.hasPrev).toBe(true);
    expect(second.hasNext).toBe(false);
  });
});
