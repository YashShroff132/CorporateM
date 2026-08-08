'use client';

/**
 * ShopFilters — client-rendered filter and sort controls for the catalog.
 *
 * Rendered on every shop/collection view, including the empty state, so the
 * active filter controls are always retained when no products match (Req 2.7).
 * Every control change immediately updates the URL via router.replace() so the
 * page re-renders with new filters — no Apply button required.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useTransition } from 'react';
import { SORTS, encodeShopQuery, type ShopQuery, type Sort } from '@/services/shop';
import type { Tier } from '@/services/catalog';
import { TIERS } from '@/services/catalog';

const SORT_LABELS: Record<Sort, string> = {
  newest: 'Newest',
  priceAsc: 'Price: Low to High',
  priceDesc: 'Price: High to Low',
  bestSelling: 'Best Selling',
};

const TIER_LABELS: Record<Tier, string> = {
  SAFE: 'Safe for Work',
  DIRECT: 'Off the Record',
  VERY_DIRECT: 'Severance Pending',
};

export interface ShopFiltersProps {
  /** The base path for navigation (e.g. "/shop" or "/"). */
  action: string;
  /** Current parsed query, used to pre-select the active controls. */
  query: ShopQuery;
  /** Available color facet values discovered from the catalog. */
  colors: string[];
  /** Available size facet values discovered from the catalog. */
  sizes: string[];
  /** When true, the tier facet is hidden (unused on a fixed collection page). */
  hideTier?: boolean;
}

export function ShopFilters({
  action,
  query,
  colors,
  sizes,
  hideTier = false,
}: ShopFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /** Navigate to the new URL with updated query params. */
  const navigate = useCallback(
    (newQuery: ShopQuery) => {
      const qs = encodeShopQuery(newQuery);
      const url = qs ? `${action}?${qs}` : action;
      startTransition(() => {
        router.replace(url, { scroll: false });
      });
    },
    [action, router],
  );

  /** Toggle a value in an array facet (tier, color, size). */
  const toggleFacet = useCallback(
    (facet: 'tier' | 'color' | 'size', value: string, checked: boolean) => {
      const current = (query[facet] as string[] | undefined) ?? [];
      const next = checked
        ? [...current, value]
        : current.filter((v) => v !== value);
      navigate({ ...query, [facet]: next.length > 0 ? next : undefined, page: 1 });
    },
    [query, navigate],
  );

  /** Update the sort selection. */
  const changeSort = useCallback(
    (sort: Sort) => {
      navigate({ ...query, sort, page: 1 });
    },
    [query, navigate],
  );

  return (
    <div
      className={`flex flex-col gap-6 ${isPending ? 'opacity-60 pointer-events-none' : ''}`}
      aria-label="Product filters"
    >
      {!hideTier && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-bold uppercase tracking-wide">Tier</legend>
          {TIERS.map((tier) => (
            <label key={tier} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={query.tier?.includes(tier) ?? false}
                onChange={(e) => toggleFacet('tier', tier, e.target.checked)}
              />
              {TIER_LABELS[tier]}
            </label>
          ))}
        </fieldset>
      )}

      {colors.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-bold uppercase tracking-wide">Color</legend>
          {colors.map((color) => (
            <label key={color} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={query.color?.includes(color) ?? false}
                onChange={(e) => toggleFacet('color', color, e.target.checked)}
              />
              {color}
            </label>
          ))}
        </fieldset>
      )}

      {sizes.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-bold uppercase tracking-wide">Size</legend>
          {sizes.map((size) => (
            <label key={size} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={query.size?.includes(size) ?? false}
                onChange={(e) => toggleFacet('size', size, e.target.checked)}
              />
              {size}
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-bold uppercase tracking-wide">Sort</legend>
        <label className="sr-only" htmlFor="sort">
          Sort products
        </label>
        <select
          id="sort"
          value={query.sort}
          onChange={(e) => changeSort(e.target.value as Sort)}
          className="border border-ink/20 px-2 py-1 text-sm cursor-pointer"
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </fieldset>
    </div>
  );
}
