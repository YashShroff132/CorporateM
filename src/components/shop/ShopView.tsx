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
import { CollapsibleFilters } from './CollapsibleFilters';
import { ShopLayout } from './ShopLayout';
import { CouponPopup } from './CouponPopup';
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
  const isHomepage = basePath === '/' || basePath === '/shop';

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      {/* 10% Welcome Coupon Popup */}
      <CouponPopup />

      {/* Hero Banner Image (Rendered only on main catalog views) */}
      {isHomepage && (
        <div className="relative w-full h-[320px] md:h-[460px] overflow-hidden border border-ink/10 rounded-lg shadow-sm mb-4 bg-ink/5">
          <img
            src="/hero-streetwear.png"
            alt="Out of Office Streetwear Collection"
            className="w-full h-full object-cover opacity-90 transition-transform duration-10000 ease-out hover:scale-105"
          />
          {/* Minimalist Overlay banner text */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex flex-col justify-end p-6 md:p-10">
            <span className="text-[10px] font-mono uppercase tracking-widest text-paper/90 mb-1.5 font-bold">
              Out of Office // Always On Style
            </span>
            <h2 className="text-2xl md:text-4xl font-black uppercase text-paper tracking-tight max-w-xl drop-shadow">
              Currently unavailable<br />& permanently out of office.
            </h2>
          </div>
        </div>
      )}

      <header className="flex flex-col gap-2">
        {heading && <h1 className="text-3xl font-black tracking-tight">{heading}</h1>}
        {intro && <p className="text-muted">{intro}</p>}
        <p className="text-sm text-muted">
          {page.totalItems} {page.totalItems === 1 ? 'product' : 'products'}
        </p>
      </header>

      {/* Integrate collapsible desktop/mobile layout manager */}
      <ShopLayout
        filters={
          <CollapsibleFilters>
            <ShopFilters
              action={basePath}
              query={query}
              colors={colors}
              sizes={sizes}
              hideTier={hideTier}
            />
          </CollapsibleFilters>
        }
        products={
          <>
            <ProductGrid items={page.items} />
            <Pagination basePath={basePath} baseQuery={baseQuery} page={page} />
          </>
        }
      />
    </main>
  );
}
