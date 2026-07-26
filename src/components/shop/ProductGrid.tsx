/**
 * ProductGrid — server-rendered grid of the current page of PUBLISHED products
 * with hover multi-image sliding and Myntra-style arrow controls.
 */

import type { ShopProductView } from '@/services/shop';
import { ScrollReveal } from './ScrollReveal';
import { ProductCardItem } from './ProductCardItem';

export interface ProductGridProps {
  items: ShopProductView[];
  /** Message shown when there are no items. */
  emptyMessage?: string;
}

const DEFAULT_EMPTY_MESSAGE =
  'No matching products. Try adjusting or clearing your filters.';

/** Round a raw MRP to a clean ₹X99 price point (e.g. ₹1499, ₹1999, ₹2499). */
function cleanMrp(salePrice: number): number {
  const raw = salePrice / 0.6;
  return Math.ceil(raw / 100) * 100 - 1;
}

const COLLECTION_TITLES: Record<string, string> = {
  operator: 'Intern',
  believer: 'Associate',
  heretic: 'Manager',
};

export function ProductGrid({
  items,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
}: ProductGridProps) {
  if (items.length === 0) {
    return (
      <div
        role="status"
        className="flex min-h-40 flex-col items-center justify-center gap-2 border border-dashed border-ink/20 p-8 text-center"
      >
        <p className="text-lg font-bold">Nothing here yet</p>
        <p className="text-sm text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((product, index) => (
        <li key={product.id} className="list-none">
          <ScrollReveal delay={(index % 4) * 100}>
            <ProductCardItem
              product={product}
              cleanMrp={cleanMrp}
              collectionTitles={COLLECTION_TITLES}
            />
          </ScrollReveal>
        </li>
      ))}
    </ul>
  );
}
