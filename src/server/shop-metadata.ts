/**
 * SEO metadata helpers for the SSR shop and collection pages.
 *
 * Builds the Next.js `Metadata` for a catalog view: a canonical URL resolving
 * to the absolute page URL, and rel prev/next links reflecting whether adjacent
 * pages exist (Req 2.8, Req 19.2). Titles are kept within 1..60 chars and
 * descriptions within 1..160 chars (Req 19.2).
 */

import type { Metadata } from 'next';

import { absoluteUrl } from '@/lib/site';
import {
  encodeShopQuery,
  type Page,
  type ShopProduct,
  type ShopQuery,
} from '@/services/shop';

/** Clamp a string to a maximum length, trimming whitespace. */
function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).trimEnd();
}

/** Encode a query targeting a specific page number (page 1 omits the param). */
function encodeForPage(query: ShopQuery, page: number): string {
  return encodeShopQuery({ ...query, page });
}

export interface ShopMetadataInput {
  /** Route path for the view, e.g. `/shop` or `/collections/slug`. */
  path: string;
  /** Canonical, parsed query for the current view. */
  query: ShopQuery;
  /** The page result, used to decide rel prev/next. */
  page: Page<ShopProduct>;
  title: string;
  description: string;
}

/**
 * Produce Metadata with a canonical URL and rel prev/next links. The canonical
 * URL reflects the current page's filters/sort/page; `prev`/`next` are included
 * only when the corresponding adjacent page exists (Req 2.8, 19.2).
 */
export function buildShopMetadata(input: ShopMetadataInput): Metadata {
  const { path, query, page } = input;

  const canonicalQuery = encodeForPage(query, page.page);
  const canonical = absoluteUrl(path, canonicalQuery);

  const others: Record<string, string> = {};
  if (page.hasPrev) {
    others['prev'] = absoluteUrl(path, encodeForPage(query, page.page - 1));
  }
  if (page.hasNext) {
    others['next'] = absoluteUrl(path, encodeForPage(query, page.page + 1));
  }

  return {
    title: clamp(input.title, 60),
    description: clamp(input.description, 160),
    alternates: { canonical },
    ...(Object.keys(others).length > 0 ? { other: others } : {}),
  };
}
