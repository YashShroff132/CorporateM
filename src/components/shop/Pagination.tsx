/**
 * Pagination — visible prev/next navigation for a catalog page. Complements the
 * <link rel="prev"/"next"> tags emitted in page metadata (Req 2.8) by giving
 * shoppers (and crawlers) real anchor links between pages.
 */

import type { Page, ShopProduct } from '@/services/shop';

export interface PaginationProps {
  /** Base path the links point at, e.g. `/shop` or `/collections/foo`. */
  basePath: string;
  /** Encoded query string for the current view, without a leading `?`. */
  baseQuery: string;
  page: Page<ShopProduct>;
}

function withPage(baseQuery: string, page: number): string {
  const params = new URLSearchParams(baseQuery);
  if (page <= 1) {
    params.delete('page');
  } else {
    params.set('page', String(page));
  }
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : '';
}

export function Pagination({ basePath, baseQuery, page }: PaginationProps) {
  if (page.totalPages <= 1) return null;

  return (
    <nav
      className="flex items-center justify-between gap-4 pt-6"
      aria-label="Pagination"
    >
      {page.hasPrev ? (
        <a
          rel="prev"
          href={`${basePath}${withPage(baseQuery, page.page - 1)}`}
          className="text-sm font-bold underline"
        >
          ← Previous
        </a>
      ) : (
        <span className="text-sm text-muted">← Previous</span>
      )}

      <span className="text-sm text-muted">
        Page {page.page} of {page.totalPages}
      </span>

      {page.hasNext ? (
        <a
          rel="next"
          href={`${basePath}${withPage(baseQuery, page.page + 1)}`}
          className="text-sm font-bold underline"
        >
          Next →
        </a>
      ) : (
        <span className="text-sm text-muted">Next →</span>
      )}
    </nav>
  );
}
