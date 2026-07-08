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
import { ScrollReveal } from './ScrollReveal';

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
    <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((product, index) => (
        <li key={product.id} className="list-none">
          <ScrollReveal delay={(index % 4) * 100}>
            <div className="border border-ink/10 rounded-lg overflow-hidden bg-paper transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg hover:border-ink/25 group">
              <a
                href={`/product/${product.slug}`}
                className="flex h-full flex-col gap-3.5 p-3.5"
              >
                {/* Image Container with zoom crop effect */}
                <div className="overflow-hidden rounded-md bg-ink/5 aspect-square relative border border-ink/5">
                  <div className="transition-transform duration-500 ease-out group-hover:scale-[1.04]">
                    <ProductImage
                      src={product.mockupUrl}
                      alt={product.slogan}
                      width={320}
                      height={320}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted font-bold">
                    {product.collectionSlug}
                  </span>
                  <span className="text-sm font-bold text-ink leading-tight line-clamp-2 min-h-[2.5rem]">
                    {product.slogan}
                  </span>
                  <span className="text-sm font-extrabold text-stamp-red mt-1 font-mono">
                    ₹{product.priceInr}
                  </span>
                </div>
              </a>
            </div>
          </ScrollReveal>
        </li>
      ))}
    </ul>
  );
}
