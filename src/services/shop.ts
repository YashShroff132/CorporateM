/**
 * Shop_UI (faceted browsing logic) — ShopQueryParser plus filter, sort, and
 * pagination helpers for the customer-facing catalog (Requirement 2).
 *
 * This module is a pure logic core with no I/O so it can be exercised by unit
 * and property tests without a database or a running Next.js server. Route
 * handlers/server components parse the request URL into a {@link ShopQuery},
 * fetch PUBLISHED products, and use {@link getShopPage} to produce the page to
 * render.
 *
 * Responsibilities:
 * - `parse` reads tier/collection/color/size/price-range/sort/page from a
 *   `URLSearchParams`, discarding unrecognized, malformed, or out-of-range
 *   values and defaulting the sort to "newest" (Req 2.1, 2.2, 2.6).
 * - `encode` is round-trippable with `parse` for any canonical ShopQuery so a
 *   filtered/sorted view is shareable via its URL (Req 2.3).
 * - `applyFilters` combines every active facet with logical AND (Req 2.5).
 * - `paginate` returns 24 products per page and reports prev/next existence so
 *   canonical + rel prev/next links can be emitted (Req 2.8).
 */

import type { Tier } from './catalog';
import { TIERS } from './catalog';

// ---------------------------------------------------------------------------
// Constants and value bounds (Requirement 2)
// ---------------------------------------------------------------------------

/** Products per catalog page (Req 2.8). */
export const PAGE_SIZE = 24;

/** Price range lower bound, in INR (Req 2.1). */
export const PRICE_INR_MIN = 0;

/** Price range upper bound, in INR (Req 2.1). */
export const PRICE_INR_MAX = 999_999;

/** Allowed sort selections; the first entry is the default (Req 2.2). */
export const SORTS = ['newest', 'priceAsc', 'priceDesc', 'bestSelling'] as const;
export type Sort = (typeof SORTS)[number];

/** Default sort applied when no valid sort selection is present (Req 2.2). */
export const DEFAULT_SORT: Sort = 'newest';

/** Default page when no valid page selection is present. */
export const DEFAULT_PAGE = 1;

// URL parameter names used by both `parse` and `encode`.
const PARAM = {
  tier: 'tier',
  collection: 'collection',
  color: 'color',
  size: 'size',
  priceMin: 'priceMin',
  priceMax: 'priceMax',
  sort: 'sort',
  page: 'page',
} as const;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/**
 * The active filter and sort selections for a shop view.
 *
 * Array facets are held in canonical form (de-duplicated and lexicographically
 * sorted) so that `parse(encode(query))` is stable and equal to `query`
 * (Req 2.3). `sort` and `page` always carry a concrete default so callers never
 * deal with an "unset" sort.
 */
export interface ShopQuery {
  tier?: Tier[];
  collection?: string[];
  color?: string[];
  size?: string[];
  priceMinInr?: number; // integer INR, 0..999,999
  priceMaxInr?: number; // integer INR, 0..999,999
  sort: Sort; // defaults to "newest"
  page: number; // >= 1
}

/**
 * The subset of product data the shop browsing logic needs to filter and sort.
 * A product exposes the colors and sizes offered across its variants so a
 * color/size facet matches when any variant satisfies it.
 */
export interface ShopProduct {
  id: string;
  tier: Tier;
  collectionSlug: string;
  colors: string[];
  sizes: string[];
  priceInr: number; // product price in INR used for range filtering
  createdAt: Date;
  unitsSold: number; // used by the "bestSelling" sort
}

/**
 * A {@link ShopProduct} enriched with the display fields the grid needs to show
 * a product and link to its detail page: the product `slug` (for the PDP href)
 * and the `slogan` used as its display name. The data-access layer produces
 * this shape; the pure filter/sort/paginate logic operates on the base
 * {@link ShopProduct} fields, so it flows through unchanged.
 */
export interface ShopProductView extends ShopProduct {
  slug: string;
  slogan: string;
  /** Optional product mockup image URL for the grid thumbnail (Req 24.4). */
  mockupUrl?: string;
  /** Optional back-view mockup URL for the hover flip animation. */
  mockupBackUrl?: string;
  /** Optional front background template image (e.g. /model-front-white.png). */
  mockupBgUrl?: string;
  /** Optional back background template image (e.g. /model-back-white.png). */
  mockupBackBgUrl?: string;
}

/** A single page of results plus the metadata needed for pagination links. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrev: boolean; // emit rel="prev" when true (Req 2.8)
  hasNext: boolean; // emit rel="next" when true (Req 2.8)
}

export interface ShopQueryParser {
  parse(searchParams: URLSearchParams): ShopQuery;
  encode(query: ShopQuery): string;
}

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

/** De-duplicate and lexicographically sort a list of strings (canonical form). */
function canonicalize(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Collect the raw values for a facet, supporting both repeated params
 * (`?color=red&color=blue`) and comma-separated values (`?color=red,blue`).
 * Empty and whitespace-only entries are discarded.
 */
function collectValues(params: URLSearchParams, key: string): string[] {
  const out: string[] = [];
  for (const raw of params.getAll(key)) {
    for (const part of raw.split(',')) {
      const trimmed = part.trim();
      if (trimmed.length > 0) out.push(trimmed);
    }
  }
  return out;
}

/** Parse a bounded integer INR price, returning undefined for invalid input. */
function parsePriceInr(value: string | null): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  // Digits only: rejects signs, decimals, and non-numeric text (Req 2.6).
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < PRICE_INR_MIN || n > PRICE_INR_MAX) {
    return undefined;
  }
  return n;
}

function isSort(value: string | null): value is Sort {
  return value !== null && (SORTS as readonly string[]).includes(value);
}

function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Parser factory
// ---------------------------------------------------------------------------

/** Create a {@link ShopQueryParser}. Parsing and encoding are pure. */
export function createShopQueryParser(): ShopQueryParser {
  return {
    parse(searchParams: URLSearchParams): ShopQuery {
      return parseShopQuery(searchParams);
    },
    encode(query: ShopQuery): string {
      return encodeShopQuery(query);
    },
  };
}

/**
 * Parse filter and sort selections from a URL, ignoring any unrecognized,
 * malformed, or out-of-range parameter and defaulting the sort to "newest"
 * (Req 2.1, 2.2, 2.6). The returned query is in canonical form.
 */
export function parseShopQuery(searchParams: URLSearchParams): ShopQuery {
  const query: ShopQuery = {
    sort: DEFAULT_SORT,
    page: DEFAULT_PAGE,
  };

  // Tier facet: keep only recognized tier values (Req 2.1, 2.6).
  const tiers = canonicalize(
    collectValues(searchParams, PARAM.tier).filter(isTier),
  ) as Tier[];
  if (tiers.length > 0) query.tier = tiers;

  // String facets: any non-empty token is a valid value.
  const collections = canonicalize(collectValues(searchParams, PARAM.collection));
  if (collections.length > 0) query.collection = collections;

  const colors = canonicalize(collectValues(searchParams, PARAM.color));
  if (colors.length > 0) query.color = colors;

  const sizes = canonicalize(collectValues(searchParams, PARAM.size));
  if (sizes.length > 0) query.size = sizes;

  // Price range: each bound validated independently (Req 2.1, 2.6).
  const priceMin = parsePriceInr(searchParams.get(PARAM.priceMin));
  if (priceMin !== undefined) query.priceMinInr = priceMin;

  const priceMax = parsePriceInr(searchParams.get(PARAM.priceMax));
  if (priceMax !== undefined) query.priceMaxInr = priceMax;

  // Sort: fall back to the default when absent or unrecognized (Req 2.2, 2.6).
  const sort = searchParams.get(PARAM.sort);
  if (isSort(sort)) query.sort = sort;

  // Page: positive integer only, otherwise the first page (Req 2.6).
  const rawPage = searchParams.get(PARAM.page);
  if (rawPage !== null && /^\d+$/.test(rawPage.trim())) {
    const n = Number(rawPage.trim());
    if (Number.isInteger(n) && n >= 1) query.page = n;
  }

  return query;
}

/**
 * Encode a ShopQuery into a URL query string that round-trips through
 * {@link parseShopQuery} (Req 2.3). Default sort ("newest") and the first page
 * are omitted for cleaner URLs; because `parse` restores those defaults, the
 * round trip is preserved. Array facets are emitted in canonical form.
 */
export function encodeShopQuery(query: ShopQuery): string {
  const params = new URLSearchParams();

  if (query.tier && query.tier.length > 0) {
    params.set(PARAM.tier, canonicalize(query.tier).join(','));
  }
  if (query.collection && query.collection.length > 0) {
    params.set(PARAM.collection, canonicalize(query.collection).join(','));
  }
  if (query.color && query.color.length > 0) {
    params.set(PARAM.color, canonicalize(query.color).join(','));
  }
  if (query.size && query.size.length > 0) {
    params.set(PARAM.size, canonicalize(query.size).join(','));
  }
  if (query.priceMinInr !== undefined) {
    params.set(PARAM.priceMin, String(query.priceMinInr));
  }
  if (query.priceMaxInr !== undefined) {
    params.set(PARAM.priceMax, String(query.priceMaxInr));
  }
  if (query.sort !== DEFAULT_SORT) {
    params.set(PARAM.sort, query.sort);
  }
  if (query.page !== DEFAULT_PAGE) {
    params.set(PARAM.page, String(query.page));
  }

  return params.toString();
}

// ---------------------------------------------------------------------------
// Filtering, sorting, and pagination
// ---------------------------------------------------------------------------

/** Whether two string lists share at least one element. */
function intersects(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return b.some((v) => set.has(v));
}

/**
 * Whether a product satisfies every active facet of the query. Facets combine
 * with logical AND across facets; within a facet, membership is a logical OR
 * (a product matches if any of its values is selected) (Req 2.5).
 */
export function matchesFilters(product: ShopProduct, query: ShopQuery): boolean {
  if (query.tier && query.tier.length > 0 && !query.tier.includes(product.tier)) {
    return false;
  }
  if (
    query.collection &&
    query.collection.length > 0 &&
    !query.collection.includes(product.collectionSlug)
  ) {
    return false;
  }
  if (query.color && query.color.length > 0 && !intersects(product.colors, query.color)) {
    return false;
  }
  if (query.size && query.size.length > 0 && !intersects(product.sizes, query.size)) {
    return false;
  }
  if (query.priceMinInr !== undefined && product.priceInr < query.priceMinInr) {
    return false;
  }
  if (query.priceMaxInr !== undefined && product.priceInr > query.priceMaxInr) {
    return false;
  }
  return true;
}

/**
 * Apply all active filters, returning products that satisfy every facet.
 * Generic over any type extending {@link ShopProduct} so enriched shapes
 * (e.g. {@link ShopProductView}) keep their extra display fields.
 */
export function applyFilters<T extends ShopProduct>(
  products: readonly T[],
  query: ShopQuery,
): T[] {
  return products.filter((p) => matchesFilters(p, query));
}

/**
 * Sort products by the query's sort selection. Ties are broken by descending
 * `createdAt` and then by `id` so ordering is deterministic and stable.
 */
export function sortProducts<T extends ShopProduct>(
  products: readonly T[],
  sort: Sort,
): T[] {
  const byNewest = (a: ShopProduct, b: ShopProduct): number => {
    const diff = b.createdAt.getTime() - a.createdAt.getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  };

  const sorted = [...products];
  switch (sort) {
    case 'priceAsc':
      sorted.sort((a, b) => a.priceInr - b.priceInr || byNewest(a, b));
      break;
    case 'priceDesc':
      sorted.sort((a, b) => b.priceInr - a.priceInr || byNewest(a, b));
      break;
    case 'bestSelling':
      sorted.sort((a, b) => b.unitsSold - a.unitsSold || byNewest(a, b));
      break;
    case 'newest':
    default:
      sorted.sort(byNewest);
      break;
  }
  return sorted;
}

/**
 * Slice an already-ordered list into a single page of at most {@link PAGE_SIZE}
 * items. The requested page is clamped to the valid range so `hasPrev`/`hasNext`
 * accurately reflect whether adjacent pages exist (Req 2.8).
 */
export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number = PAGE_SIZE,
): Page<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const start = (current - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
    page: current,
    pageSize,
    totalItems,
    totalPages,
    hasPrev: current > 1,
    hasNext: current < totalPages,
  };
}

/**
 * Convenience pipeline: apply the query's filters, sort the matches, and return
 * the requested page of at most 24 products (Req 2.5, 2.8). This is what an SSR
 * shop route uses after fetching PUBLISHED products.
 */
export function getShopPage<T extends ShopProduct>(
  products: readonly T[],
  query: ShopQuery,
): Page<T> {
  const filtered = applyFilters(products, query);
  const sorted = sortProducts(filtered, query.sort);
  return paginate(sorted, query.page);
}
