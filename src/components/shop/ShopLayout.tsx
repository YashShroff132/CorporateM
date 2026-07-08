'use client';

import { useState } from 'react';

interface ShopLayoutProps {
  filters: React.ReactNode;
  products: React.ReactNode;
}

export function ShopLayout({ filters, products }: ShopLayoutProps) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {/* Desktop Filter Toggle Bar (Hidden on Mobile) */}
      <div className="hidden md:flex justify-between items-center border-b border-ink/10 pb-3">
        <button
          type="button"
          onClick={() => setShowFilters((prev) => !prev)}
          className="flex items-center gap-2 border border-ink/20 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-paper text-ink rounded transition-colors hover:bg-ink/5"
          aria-expanded={showFilters}
        >
          {/* Funnel Icon */}
          <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
          </svg>
          Filters
          {showFilters && (
            <span className="text-[9px] font-normal normal-case tracking-normal text-ink/50">✕</span>
          )}
        </button>
      </div>

      {/* Responsive Grid Layout */}
      <div
        className={[
          'grid grid-cols-1 gap-8 transition-all duration-300 ease-in-out',
          showFilters ? 'md:grid-cols-[220px_1fr]' : 'md:grid-cols-1',
        ].join(' ')}
      >
        {/* Sidebar container */}
        <aside
          className={[
            'md:sticky md:top-6 md:self-start transition-all duration-300',
            showFilters ? 'block' : 'md:hidden',
          ].join(' ')}
        >
          {filters}
        </aside>

        {/* Catalog items section */}
        <section className="flex flex-col gap-6">
          {products}
        </section>
      </div>
    </div>
  );
}
