'use client';

import { useState, useRef } from 'react';
import { ProductImage } from '@/components/ProductImage';

interface GalleryImage {
  id: string;
  label: string;
  url: string;
}

interface ProductImageGalleryProps {
  frontUrl: string;
  backUrl?: string | null;
  fullUrl?: string | null;
  extraImages?: string[];
  slogan: string;
}

export function ProductImageGallery({
  frontUrl,
  backUrl,
  fullUrl,
  extraImages = [],
  slogan,
}: ProductImageGalleryProps) {
  const images: GalleryImage[] = [
    { id: 'front', label: 'Front View', url: frontUrl },
  ];

  extraImages.forEach((imgUrl, idx) => {
    if (imgUrl && !imgUrl.startsWith('data:')) {
      images.push({
        id: `extra-${idx}`,
        label: `Shot ${idx + 1}`,
        url: imgUrl,
      });
    }
  });

  if (backUrl && !backUrl.startsWith('data:')) {
    images.push({ id: 'back', label: 'Back View', url: backUrl });
  }

  if (fullUrl) {
    images.push({ id: 'full', label: 'Full View', url: fullUrl });
  }

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const touchStartX = useRef<number | null>(null);

  const activeImage: GalleryImage = images[activeIndex] || images[0] || { id: 'front', label: 'Front View', url: frontUrl };

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  // Touch Swipe Handler for Mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches && e.touches[0]) {
      touchStartX.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || !e.changedTouches || !e.changedTouches[0]) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    touchStartX.current = null;
  };

  return (
    <div className="flex flex-col gap-4 select-none">
      {/* Main Image Display (Myntra Style with Arrows & Badge) */}
      <div 
        className="group relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-ink/10 bg-paper shadow-sm"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {activeImage.url.startsWith('data:') ? (
          <ProductImage
            src={frontUrl}
            alt={slogan}
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="h-full w-full object-cover"
          />
        ) : (
          <ProductImage
            key={activeImage.url}
            src={activeImage.url}
            alt={`${slogan} - ${activeImage.label}`}
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="h-full w-full object-cover transition-opacity duration-300"
          />
        )}

        {/* Counter Badge (Myntra Style: 1 / 3) */}
        {images.length > 1 && (
          <div className="absolute top-3 right-3 z-10 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-mono font-bold text-white backdrop-blur-md">
            {activeIndex + 1} / {images.length}
          </div>
        )}

        {/* Left Arrow Button */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous image"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-black shadow-md transition-all hover:bg-white hover:scale-110 active:scale-95 dark:bg-black/80 dark:text-white"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Right Arrow Button */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next image"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-black shadow-md transition-all hover:bg-white hover:scale-110 active:scale-95 dark:bg-black/80 dark:text-white"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Thumbnail Switcher (Myntra Style Gallery Bar) */}
      {images.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {images.map((img, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={`relative flex items-center gap-2 rounded-lg border p-1 transition-all ${
                  isActive
                    ? 'border-stamp-red ring-2 ring-stamp-red/30 bg-paper'
                    : 'border-ink/10 bg-paper/60 opacity-70 hover:opacity-100 hover:border-ink/30'
                }`}
              >
                <div className="h-14 w-12 overflow-hidden rounded border border-ink/10">
                  <ProductImage
                    src={img.url}
                    alt={img.label}
                    width={48}
                    height={56}
                    className="h-full w-full object-cover"
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
