/**
 * ProductGrid — server-rendered grid of the current page of PUBLISHED products
 * with a 3D backflip hover animation showing front/back t-shirt views.
 *
 * The flip is built into the card itself: any product with a `mockupBackUrl`
 * gets the 3D rotation on hover. Products without a back image degrade
 * gracefully to the existing scale/lift effect.
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

/** Round a raw MRP to a clean ₹X99 price point (e.g. ₹1499, ₹1999, ₹2499). */
function cleanMrp(salePrice: number): number {
  const raw = salePrice / 0.6;
  return Math.ceil(raw / 100) * 100 - 1;
}

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
            <a
              href={`/product/${product.slug}`}
              className="product-card block border border-ink/10 rounded-lg overflow-hidden bg-paper transition-all duration-300 hover:shadow-xl hover:border-ink/25 hover:-translate-y-2"
            >
              {/* --- 3D Flip Image Container --- */}
              <div className="product-flip-container aspect-square relative border-b border-ink/5">
                <div className="product-flip-inner">
                  {/* FRONT face */}
                  <div className="product-flip-face product-flip-front relative">
                    {product.mockupUrl?.startsWith('data:') ? (
                      <>
                        <ProductImage
                          src={product.mockupBgUrl || (product.colors.includes('white') ? '/blank-white-tee.png' : '/blank-black-tee.png')}
                          alt={product.slogan}
                          width={320}
                          height={320}
                        />
                        <div className="absolute inset-0 pointer-events-none select-none">
                          <img
                            src={product.mockupUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </>
                    ) : (
                      <ProductImage
                        src={product.mockupUrl}
                        alt={product.slogan}
                        width={320}
                        height={320}
                      />
                    )}
                  </div>
                  {/* BACK face — Typographic Minimalist Design (No human model) */}
                  <div className="product-flip-face product-flip-back absolute inset-0 w-full h-full flex flex-col justify-between p-6 bg-ink text-paper dark:bg-paper dark:text-ink border border-ink/25 font-mono select-none">
                    <div className="flex justify-between items-center text-[9px] opacity-70">
                      <span>[ AUTO-REPLY: ON ]</span>
                      <span>[ TIER: {product.tier} ]</span>
                    </div>
                    
                    <div className="flex flex-col items-center justify-center my-auto">
                      <span className="text-4xl font-black tracking-[0.25em] leading-none mb-1 text-paper dark:text-ink">OOO</span>
                      <span className="text-[9px] uppercase tracking-widest text-highlighter font-bold">OUT OF OFFICE</span>
                    </div>
                    
                    <div className="flex flex-col gap-1 border-t border-paper/10 dark:border-ink/10 pt-4 text-left">
                      <span className="text-[9px] uppercase tracking-wider text-muted">Slogan ID // {product.slug}</span>
                      <span className="text-[10px] truncate max-w-full font-bold uppercase">{product.slogan}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* --- Product Info --- */}
              <div className="flex flex-col gap-1 p-3.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted font-bold">
                  {product.collectionSlug}
                </span>
                <span className="text-sm font-bold text-ink leading-tight line-clamp-2 min-h-[2.5rem]">
                  {product.slogan}
                </span>
                <div className="flex items-baseline gap-1.5 mt-1 font-mono">
                  <span className="text-sm font-extrabold text-stamp-red">
                    ₹{product.priceInr}
                  </span>
                  <span className="line-through text-[11px] text-muted font-normal">
                    ₹{cleanMrp(product.priceInr)}
                  </span>
                </div>
              </div>
            </a>
          </ScrollReveal>
        </li>
      ))}
    </ul>
  );
}
