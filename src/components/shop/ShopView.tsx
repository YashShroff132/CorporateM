/**
 * ShopView — the shared server-rendered layout for a catalog view (the main
 * shop page and each collection landing page). Composes the retained filter
 * controls, the product grid (or empty state), and pagination.
 *
 * Keeping filters and grid siblings guarantees the filter controls remain
 * visible even when the grid is empty (Req 2.7).
 */

import { ShopFilters } from './ShopFilters';
import { ProductGrid } from './ProductGrid';
import { Pagination } from './Pagination';
import type { Page, ShopProductView, ShopQuery } from '@/services/shop';

export interface ShopViewProps {
  heading: string;
  intro?: string;
  /** Base path for filter form action and pagination links. */
  basePath: string;
  /** Encoded query string (no leading `?`) for pagination links. */
  baseQuery: string;
  query: ShopQuery;
  page: Page<ShopProductView>;
  colors: string[];
  sizes: string[];
  hideTier?: boolean;
}

export function ShopView({
  heading,
  intro,
  basePath,
  baseQuery,
  query,
  page,
  colors,
  sizes,
  hideTier = false,
}: ShopViewProps) {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-black tracking-tight">{heading}</h1>
        {intro && <p className="text-muted">{intro}</p>}
        <p className="text-sm text-muted">
          {page.totalItems} {page.totalItems === 1 ? 'product' : 'products'}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-6 md:self-start">
          <ShopFilters
            action={basePath}
            query={query}
            colors={colors}
            sizes={sizes}
            hideTier={hideTier}
          />
        </aside>

        <section className="flex flex-col gap-6">
          <ProductGrid items={page.items} />
          <Pagination basePath={basePath} baseQuery={baseQuery} page={page} />
        </section>
      </div>
    </main>
  );
}
