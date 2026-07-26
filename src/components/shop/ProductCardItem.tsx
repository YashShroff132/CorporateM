'use client';

import { useState, useRef, useEffect } from 'react';
import type { ShopProductView } from '@/services/shop';
import { ProductImage } from '@/components/ProductImage';
import { OOOLogo } from '../OOOLogo';

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

interface ProductCardItemProps {
  product: ShopProductView;
}

export function ProductCardItem({ product }: ProductCardItemProps) {
  // Build deduplicated array of available image URLs
  const allImages: string[] = [];
  if (product.mockupUrl) allImages.push(product.mockupUrl);
  if (product.galleryUrls && product.galleryUrls.length > 0) {
    product.galleryUrls.forEach((url) => {
      if (url && !allImages.includes(url)) allImages.push(url);
    });
  }
  if (product.mockupBackUrl && !allImages.includes(product.mockupBackUrl)) {
    allImages.push(product.mockupBackUrl);
  }

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const hoverIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (hoverIntervalRef.current) {
        clearInterval(hoverIntervalRef.current);
      }
    };
  }, []);

  const stopAutoSlide = () => {
    if (hoverIntervalRef.current) {
      clearInterval(hoverIntervalRef.current);
      hoverIntervalRef.current = null;
    }
  };

  const startAutoSlide = () => {
    stopAutoSlide();
    if (allImages.length > 1 && !isPaused) {
      hoverIntervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % allImages.length);
      }, 2200); // 2.2s comfortable slide interval
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    startAutoSlide();
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsPaused(false);
    stopAutoSlide();
    setCurrentIndex(0);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % allImages.length);
  };

  return (
    <a
      href={`/product/${product.slug}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="product-card group relative block border border-ink/10 rounded-lg overflow-hidden bg-paper transition-all duration-300 hover:shadow-xl hover:border-slate-400 dark:hover:border-slate-500 hover:-translate-y-1.5"
    >
      {/* --- Metallic Silver Top Sheen Accent Line on Hover --- */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-slate-400 dark:via-slate-200 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30 pointer-events-none" />

      {/* --- Preloaded Image Container (Zero Black Screen Flicker) --- */}
      <div className="aspect-square relative border-b border-ink/5 overflow-hidden bg-paper select-none">
        {allImages.length > 0 ? (
          allImages.map((src, idx) => (
            <div
              key={src}
              className={`absolute inset-0 transition-opacity duration-300 ease-in-out ${
                idx === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
              }`}
            >
              {src.startsWith('data:') ? (
                <ProductImage
                  src={product.mockupBgUrl || (product.colors.includes('white') ? '/blank-white-tee.png' : '/blank-black-tee.png')}
                  alt={product.slogan}
                  width={320}
                  height={320}
                />
              ) : (
                <ProductImage
                  src={src}
                  alt={`${product.slogan} view ${idx + 1}`}
                  width={320}
                  height={320}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          ))
        ) : (
          <div className="flex flex-col justify-between p-8 font-mono select-none text-center h-full my-auto bg-ink text-paper dark:bg-paper dark:text-ink">
            <div className="flex flex-col items-center justify-center my-auto">
              <OOOLogo className="h-9 w-auto mb-2 text-paper dark:text-ink" />
              <span className="text-[10px] uppercase tracking-widest text-highlighter font-bold">OUT OF OFFICE</span>
            </div>
            <div className="border-t border-paper/10 dark:border-ink/10 pt-4">
              <span className="text-xs font-bold uppercase tracking-wide leading-relaxed block">{product.slogan}</span>
            </div>
          </div>
        )}

        {/* Hover Arrow Overlay & Pause Control */}
        {isHovered && allImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              onMouseEnter={() => { setIsPaused(true); stopAutoSlide(); }}
              onMouseLeave={() => { setIsPaused(false); startAutoSlide(); }}
              aria-label="Previous photo"
              className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-black shadow-md transition-all hover:bg-white hover:scale-110 active:scale-95 dark:bg-black/90 dark:text-white"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleNext}
              onMouseEnter={() => { setIsPaused(true); stopAutoSlide(); }}
              onMouseLeave={() => { setIsPaused(false); startAutoSlide(); }}
              aria-label="Next photo"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-black shadow-md transition-all hover:bg-white hover:scale-110 active:scale-95 dark:bg-black/90 dark:text-white"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {/* Pagination Indicator Dots */}
            <div className="absolute bottom-2 left-0 right-0 z-20 flex justify-center gap-1.5 pointer-events-none">
              {allImages.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === currentIndex ? 'w-4 bg-stamp-red' : 'w-1.5 bg-black/40 dark:bg-white/40'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* --- Product Info --- */}
      <div className="flex flex-col gap-1 p-3.5">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted font-bold">
          {COLLECTION_TITLES[product.collectionSlug] || product.collectionSlug}
        </span>
        <span
          className={`font-bold text-ink leading-tight min-h-[2.5rem] ${
            product.slogan.length > 30 ? 'text-xs line-clamp-3' : 'text-sm line-clamp-2'
          }`}
        >
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
  );
}
