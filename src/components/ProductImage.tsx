/**
 * ProductImage — responsive product image wrapper (Req 24.4, 24.5).
 *
 * Wraps `next/image` so every product mockup is served with explicit width and
 * height (reserving layout space to avoid CLS, Req 24.4/24.5) and in a modern
 * format. Next's image optimizer negotiates AVIF/WebP with a fallback for
 * browsers that don't support them (configured via `images.formats` in
 * `next.config.mjs`, Req 24.5).
 *
 * When no image URL is available (admin hasn't uploaded a mockup yet) it renders
 * a neutral placeholder box of the same dimensions, so the layout is stable and
 * consistent whether or not an image exists.
 */

import Image from 'next/image';

export interface ProductImageProps {
  /** Absolute or relative image URL; `undefined`/empty renders the placeholder. */
  src?: string;
  /** Accessible alt text describing the product. */
  alt: string;
  /** Intrinsic width in px used to reserve space and drive the optimizer. */
  width?: number;
  /** Intrinsic height in px used to reserve space and drive the optimizer. */
  height?: number;
  /** Responsive `sizes` hint; defaults to a full-width-on-mobile grid cell. */
  sizes?: string;
  /** Extra classes applied to the image / placeholder. */
  className?: string;
  /** Mark the image as LCP-critical (PDP hero) to prioritize its load. */
  priority?: boolean;
}

const DEFAULT_DIMENSION = 640;
const DEFAULT_SIZES = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw';

export function ProductImage({
  src,
  alt,
  width = DEFAULT_DIMENSION,
  height = DEFAULT_DIMENSION,
  sizes = DEFAULT_SIZES,
  className,
  priority = false,
}: ProductImageProps) {
  const trimmed = src?.trim() ?? '';

  // No image: reserve identical space with a neutral placeholder (avoids CLS).
  if (trimmed.length === 0) {
    return (
      <div
        className={`aspect-square w-full bg-ink/5 ${className ?? ''}`.trim()}
        role="img"
        aria-label={alt}
      />
    );
  }

  return (
    <Image
      src={trimmed}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      priority={priority}
      className={`h-auto w-full object-cover ${className ?? ''}`.trim()}
    />
  );
}
