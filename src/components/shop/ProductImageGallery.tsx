'use client';

import { useState } from 'react';
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
  slogan: string;
}

export function ProductImageGallery({
  frontUrl,
  backUrl,
  fullUrl,
  slogan,
}: ProductImageGalleryProps) {
  const images: GalleryImage[] = [
    { id: 'front', label: 'Front View', url: frontUrl },
  ];

  if (backUrl && !backUrl.startsWith('data:')) {
    images.push({ id: 'back', label: 'Back View (Design)', url: backUrl });
  }
  if (fullUrl) {
    images.push({ id: 'full', label: 'Full View', url: fullUrl });
  }

  const [activeImageId, setActiveImageId] = useState<string>('front');
  const activeImage = images.find((i) => i.id === activeImageId) ?? images[0] ?? { id: 'front', label: 'Front View', url: frontUrl };

  return (
    <div className="flex flex-col gap-4">
      {/* Main Image Display */}
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-ink/10 bg-paper shadow-sm">
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
            src={activeImage.url}
            alt={`${slogan} - ${activeImage.label}`}
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="h-full w-full object-cover transition-opacity duration-300"
          />
        )}
      </div>

      {/* Thumbnail Switcher Tabs */}
      {images.length > 1 && (
        <div className="flex items-center gap-3">
          {images.map((img) => {
            const isActive = img.id === activeImageId;
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => setActiveImageId(img.id)}
                className={`relative flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-all ${
                  isActive
                    ? 'border-ink bg-ink text-paper dark:bg-paper dark:text-ink shadow-sm'
                    : 'border-ink/15 bg-paper text-ink hover:border-ink/40'
                }`}
              >
                <div className="h-6 w-6 overflow-hidden rounded border border-ink/10">
                  <ProductImage
                    src={img.url}
                    alt={img.label}
                    width={24}
                    height={24}
                    className="h-full w-full object-cover"
                  />
                </div>
                <span>{img.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
