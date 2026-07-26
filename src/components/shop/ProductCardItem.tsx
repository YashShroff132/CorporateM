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

interface SlideItem {
  id: string;
  type: 'image' | 'ooo-back';
  url?: string;
}

export function ProductCardItem({ product }: ProductCardItemProps) {
  // Build slide items list
  const slides: SlideItem[] = [];

  // 1. Primary Front Image
  if (product.mockupUrl && !product.mockupUrl.startsWith('data:')) {
    slides.push({ id: 'front', type: 'image', url: product.mockupUrl });
  }

  // 2. Extra Lifestyle Gallery Images
  if (product.galleryUrls && product.galleryUrls.length > 0) {
    product.galleryUrls.forEach((url, idx) => {
      if (url && !slides.some((s) => s.url === url)) {
        slides.push({ id: `gallery-${idx}`, type: 'image', url });
      }
    });
  }

  // 3. Signature OOO Back View (Always the final slide)
  if (product.mockupBackUrl && !product.mockupBackUrl.startsWith('data:')) {
    if (!slides.some((s) => s.url === product.mockupBackUrl)) {
      slides.push({ id: 'back', type: 'image', url: product.mockupBackUrl });
    }
  } else {
    slides.push({ id: 'ooo-back', type: 'ooo-back' });
  }

  // Fallback if no images found
  if (slides.length === 0) {
    slides.push({ id: 'front-fallback', type: 'image', url: product.mockupBgUrl || '/blank-black-tee.png' });
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
    if (slides.length > 1 && !isPaused) {
      hoverIntervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % slides.length);
      }, 1600); // Set slide interval to 1.6s
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
    setCurrentIndex((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % slides.length);
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

      {/* --- Preloaded Image / OOO Back Container --- */}
      <div className="aspect-square relative border-b border-ink/5 overflow-hidden bg-paper select-none">
        {slides.map((slide, idx) => (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-300 ease-in-out ${
              idx === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
            }`}
          >
            {slide.type === 'image' && slide.url ? (
              <ProductImage
                src={slide.url}
                alt={`${product.slogan} view ${idx + 1}`}
                width={320}
                height={320}
                className="w-full h-full object-cover"
              />
            ) : (
              /* Signature Out of Office OOO Logo & Slogan Back Card */
              <div className="flex flex-col justify-between p-6 font-mono select-none text-center h-full w-full bg-ink text-paper dark:bg-paper dark:text-ink">
                <div className="flex flex-col items-center justify-center my-auto">
                  <OOOLogo className="h-9 w-auto mb-2 text-paper dark:text-ink" />
                  <span className="text-[10px] uppercase tracking-widest text-highlighter font-bold">OUT OF OFFICE</span>
                </div>
                <div className="border-t border-paper/10 dark:border-ink/10 pt-3">
                  <span className="text-xs font-bold uppercase tracking-wide leading-relaxed block">{product.slogan}</span>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Hover Arrow Overlay & Pause Control */}
        {isHovered && slides.length > 1 && (
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
              {slides.map((_, idx) => (
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
