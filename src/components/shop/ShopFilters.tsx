/**
 * ShopFilters — server-rendered filter and sort controls for the catalog.
 *
 * Rendered on every shop/collection view, including the empty state, so the
 * active filter controls are always retained when no products match (Req 2.7).
 * The controls submit via GET so the active selections are encoded in the page
 * URL (Req 2.3) and the next request is server-rendered with those params
 * (Req 2.4). No client JavaScript is required for the controls to work.
 */

import { SORTS, type ShopQuery, type Sort } from '@/services/shop';
import type { Tier } from '@/services/catalog';
import { TIERS } from '@/services/catalog';

const SORT_LABELS: Record<Sort, string> = {
  newest: 'Newest',
  priceAsc: 'Price: Low to High',
  priceDesc: 'Price: High to Low',
  bestSelling: 'Best Selling',
};

const TIER_LABELS: Record<Tier, string> = {
  SAFE: 'Safe',
  DIRECT: 'Direct',
  VERY_DIRECT: 'Very Direct',
};

export interface ShopFiltersProps {
  /** The form posts (GET) to this path so URLs stay shareable (Req 2.3). */
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
  return (
    <form
      method="get"
      action={action}
      className="flex flex-col gap-6"
      aria-label="Product filters"
    >
      {!hideTier && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-bold uppercase tracking-wide">Tier</legend>
          {TIERS.map((tier) => (
            <label key={tier} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="tier"
                value={tier}
                defaultChecked={query.tier?.includes(tier) ?? false}
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
            <label key={color} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="color"
                value={color}
                defaultChecked={query.color?.includes(color) ?? false}
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
            <label key={size} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="size"
                value={size}
                defaultChecked={query.size?.includes(size) ?? false}
              />
              {size}
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-bold uppercase tracking-wide">Price (INR)</legend>
        <div className="flex items-center gap-2">
          <label className="flex flex-col text-xs text-muted">
            Min
            <input
              type="number"
              name="priceMin"
              min={0}
              max={999999}
              defaultValue={query.priceMinInr ?? ''}
              className="w-24 border border-ink/20 px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col text-xs text-muted">
            Max
            <input
              type="number"
              name="priceMax"
              min={0}
              max={999999}
              defaultValue={query.priceMaxInr ?? ''}
              className="w-24 border border-ink/20 px-2 py-1 text-sm"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-bold uppercase tracking-wide">Sort</legend>
        <label className="sr-only" htmlFor="sort">
          Sort products
        </label>
        <select
          id="sort"
          name="sort"
          defaultValue={query.sort}
          className="border border-ink/20 px-2 py-1 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </fieldset>

      <button
        type="submit"
        className="bg-ink px-4 py-2 text-sm font-bold uppercase tracking-wide text-paper"
      >
        Apply filters
      </button>
    </form>
  );
}
