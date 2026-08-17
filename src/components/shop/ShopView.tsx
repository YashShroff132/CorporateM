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
import { DanglingLogo } from '@/components/DanglingLogo';
import { CorporateConfessionsWall } from '@/components/homepage/CorporateConfessionsWall';
import type { Page, ShopProductView, ShopQuery } from '@/services/shop';
import type { ToxicStoryItem } from '@/server/stories-data';

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
  stories?: readonly ToxicStoryItem[];
  products?: readonly ShopProductView[];
  submitStoryAction?: (formData: FormData) => Promise<{ success: boolean; message?: string }>;
  upvoteStoryAction?: (formData: FormData) => Promise<void>;
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
  stories,
  products,
  submitStoryAction,
  upvoteStoryAction,
}: ShopViewProps) {
  const isHomepage = basePath === '/' || basePath === '/shop';

  return (
    <div className="w-full">
      {/* 10% Welcome Coupon Popup */}
      <CouponPopup />

      {/* Hero Banner Image (Rendered only on main catalog views) */}
      {isHomepage && (
        <div className="relative w-full h-[480px] sm:h-[620px] md:h-[750px] overflow-hidden border-b border-ink/10 mb-6 bg-ink/5 -mt-[102px] md:-mt-[106px]">
          <img
            src="/hero-streetwear.png"
            alt="Out of Office Streetwear Collection"
            className="w-full h-full object-cover object-center opacity-95 transition-transform duration-10000 ease-out hover:scale-105"
          />
          {/* Minimalist Overlay banner text */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-6 md:p-10 pb-28 md:pb-32 z-20 pointer-events-none">
            <span className="text-[10px] font-mono uppercase tracking-widest text-white/90 mb-1.5 font-bold">
              Out of Office // Always On Style
            </span>
            <h2 className="text-2xl md:text-4xl font-black uppercase text-white tracking-tight max-w-xl drop-shadow">
              Permanently out of office.
            </h2>
          </div>
          {/* 3D Interactive Logo Capsule dead-centered over the bottom of the hero image */}
          <div className="absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 z-30">
            <DanglingLogo />
          </div>
        </div>
      )}

      {/* Content wrapper - centered max-width layout */}
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <header id="catalog" className="flex flex-col gap-2">
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

        {/* Corporate Confessions Wall (Toxic Boss Stories) */}
        {stories && stories.length > 0 && products && submitStoryAction && upvoteStoryAction && (
          <CorporateConfessionsWall
            stories={stories}
            products={products}
            submitStoryAction={submitStoryAction}
            upvoteStoryAction={upvoteStoryAction}
          />
        )}
      </div>
    </div>
  );
}
