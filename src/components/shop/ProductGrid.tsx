/**
 * ProductGrid — server-rendered grid of the current page of PUBLISHED products,
 * or an empty-state message when nothing matches (Req 2.4, 2.7).
 *
 * When the item list is empty this renders a clear "no matching products"
 * message. The caller keeps the filter controls mounted alongside this grid, so
 * an empty result never removes the filter UI (Req 2.7).
 */

import type { ShopProductView } from '@/services/shop';
import { ProductImage } from '@/components/ProductImage';

export interface ProductGridProps {
  items: ShopProductView[];
  /** Message shown when there are no items. */
  emptyMessage?: string;
}

const DEFAULT_EMPTY_MESSAGE =
  'No matching products. Try adjusting or clearing your filters.';

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
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((product) => (
        <li key={product.id} className="border border-ink/10">
          <a
            href={`/product/${product.slug}`}
            className="flex h-full flex-col gap-2 p-3 transition-colors hover:bg-ink/5"
          >
            <ProductImage
              src={product.mockupUrl}
              alt={product.slogan}
              width={320}
              height={320}
            />
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-muted">
                {product.collectionSlug}
              </span>
              <span className="text-sm font-semibold">{product.slogan}</span>
              <span className="text-sm font-bold">₹{product.priceInr}</span>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
