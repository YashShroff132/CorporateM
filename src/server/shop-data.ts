/**
 * Shop data-access layer — the only place the SSR shop/collection pages touch
 * the database. It fetches PUBLISHED products with their variants and owning
 * collection and maps them into the pure {@link ShopProduct} shape consumed by
 * the Shop_UI logic (filter/sort/paginate) in `services/shop`.
 *
 * Isolation is deliberate (Req 2.4, 2.9): the pages depend on these functions,
 * not on Prisma directly, so the browsing UX can be server-rendered whether or
 * not a live database is reachable. When no database is available (missing
 * `DATABASE_URL`, connection failure, or the Prisma client cannot start), each
 * function returns an empty result instead of throwing, so `next build` and
 * first render degrade gracefully to the empty state rather than crashing.
 */

import type { ShopProductView } from '@/services/shop';
import type { Collection, Product, Variant } from '@/services/catalog';
import { fitText, presetsForCollection, SAFE_CLASSIC_PRESET } from '@/services/mockup';
import type { LayoutPreset } from '@/services/mockup';
import { composePreviewSvg, composeBackSvg, svgToDataUrl } from './mockup-data';

export const CUSTOM_PRODUCT_PRESETS: Record<string, LayoutPreset> = {
  'unavailable-team-dinner': {
    id: 'ooo-syne',
    fontFamily: '"Syne", sans-serif',
    monospace: false,
    charWidthRatio: 0.58,
    lineHeightRatio: 1.15,
    align: 'center',
  },
  'stop-hallucinating': {
    id: 'ooo-space-mono',
    fontFamily: '"Space Mono", monospace',
    monospace: true,
    charWidthRatio: 0.6,
    lineHeightRatio: 1.3,
    align: 'left',
  },
  'revert-back': {
    id: 'ooo-bebas-neue',
    fontFamily: '"Bebas Neue", sans-serif',
    monospace: false,
    charWidthRatio: 0.38,
    lineHeightRatio: 1.1,
    align: 'center',
  },
  'couldve-been-email': {
    id: 'ooo-outfit',
    fontFamily: '"Outfit", sans-serif',
    monospace: false,
    charWidthRatio: 0.52,
    lineHeightRatio: 1.2,
    align: 'center',
  },
  'do-not-disturb': {
    id: 'ooo-permanent-marker',
    fontFamily: '"Permanent Marker", cursive',
    monospace: false,
    charWidthRatio: 0.55,
    lineHeightRatio: 1.3,
    align: 'center',
  },
  'team-bonding': {
    id: 'ooo-zilla-slab',
    fontFamily: '"Zilla Slab", serif',
    monospace: false,
    charWidthRatio: 0.56,
    lineHeightRatio: 1.25,
    align: 'left',
  },
  'resume-gap': {
    id: 'ooo-jetbrains-mono',
    fontFamily: '"JetBrains Mono", monospace',
    monospace: true,
    charWidthRatio: 0.6,
    lineHeightRatio: 1.3,
    align: 'center',
  },
  'immediate-quitter': {
    id: 'ooo-anton',
    fontFamily: '"Anton", sans-serif',
    monospace: false,
    charWidthRatio: 0.5,
    lineHeightRatio: 1.1,
    align: 'center',
  },
  'chai-breaks': {
    id: 'ooo-dm-serif',
    fontFamily: '"DM Serif Display", serif',
    monospace: false,
    charWidthRatio: 0.54,
    lineHeightRatio: 1.2,
    align: 'center',
  },
  'mute-is-my-crown': {
    id: 'ooo-anton',
    fontFamily: '"Anton", sans-serif',
    monospace: false,
    charWidthRatio: 0.5,
    lineHeightRatio: 1.1,
    align: 'center',
  },
  'employee-resigns': {
    id: 'ooo-syne',
    fontFamily: '"Syne", sans-serif',
    monospace: false,
    charWidthRatio: 0.58,
    lineHeightRatio: 1.15,
    align: 'center',
  },
};

export const EXTRA_PRODUCT_IMAGES: Record<string, string[]> = {
  'employee-resigns': ['/products/employee-resign-ad.jpg'],
  'like-a-family-here': ['/products/like-a-family-here-ad.png'],
  'hybrid-mandatory': ['/products/hybrid-mandatory-ad.jpg'],
  'delegator': ['/products/delegator-ad-1.png', '/products/delegator-ad-2.png', '/products/delegator-ad-3.png'],
  'wfh-over-wfo': ['/products/wfh-over-wfo-ad.png'],
  '9am-standups-toxic': ['/products/9am-standups-toxic-ad.png'],
  'chai-sutta-break': ['/products/chai-sutta-break-ad.jpg'],
  'quick-call': ['/products/quick-call-ad.png'],
  'snake-coworkers': ['/products/snake-coworkers-ad.jpg'],
  'sorry-late-claude': ['/products/sorry-late-claude-ad.png'],
  'boyfriend-wfh': ['/products/girlfriend-wfh-full.png', '/products/boyfriend-wfh-ad.jpg'],
  'good-team-manager': ['/products/good-team-manager-ad.png'],
  'happy-friday': ['/products/happy-friday-ad.jpg', '/products/happy-friday-white-ad.png'],
  'manager-eyes': ['/products/manager-eyes-ad.jpg'],
  'notice-period-energy': ['/products/notice-period-energy-ad-1.png', '/products/notice-period-energy-ad-2.png', '/products/notice-period-energy-ad-3.png'],
  'mute-is-my-crown': ['/products/mute-is-my-crown-ad.png'],
};

export interface CollectionSummary {
  slug: string;
  title: string;
  heroImage?: string;
}

/**
 * A single product with everything the PDP needs: the full product row, its
 * variants, and its owning collection — all mapped to the pure catalog domain
 * types so `services/pdp` can build the view model without touching Prisma.
 */
export interface ProductDetail {
  product: Product;
  variants: Variant[];
  collection: Collection;
}

/**
 * Load every PUBLISHED product as a {@link ShopProduct}. Colors/sizes are the
 * distinct values across the product's variants; `priceInr` is derived from the
 * base price (integer paise) rounded to whole rupees for range filtering;
 * `unitsSold` is not tracked in the schema yet and defaults to 0.
 *
 * Returns `[]` if the database is unavailable so callers render the empty state.
 */
export async function getPublishedShopProducts(): Promise<ShopProductView[]> {
  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();
    const rows = await prisma.product.findMany({
      where: { status: 'PUBLISHED' },
      include: {
        variants: { select: { color: true, size: true } },
        collection: { select: { slug: true } },
      },
    });

    if (rows.length > 0) {
      return rows.map((p) => {
        const colors = [...new Set(p.variants.map((v) => v.color))].sort();
        const sizes = [...new Set(p.variants.map((v) => v.size))].sort();
        const isWhite = colors.some((c) => c.toLowerCase().includes('white'));
        const presets = presetsForCollection(p.collection.slug, p.tier);
        const preset = CUSTOM_PRODUCT_PRESETS[p.slug] || presets[0] || SAFE_CLASSIC_PRESET;
        const layoutResult = fitText(p.slogan, { width: 380, height: 350 }, preset);
        const layout = layoutResult.ok ? layoutResult.value : { fontSize: 32, lines: [p.slogan], width: 300, height: 100, preset };
        const garmentColor = isWhite ? 'White' : 'Black';
        const mockupBgUrl = isWhite ? '/blank-white-tee.png' : '/blank-black-tee.png';
        const mockupBackBgUrl = isWhite ? '/blank-white-tee.png' : '/blank-black-tee.png';
        const mockupUrl = p.mockupUrl || svgToDataUrl(
          composePreviewSvg(layout, { garment: 'Classic Tee', color: garmentColor })
        );
        const mockupBackUrl = p.slug === 'employee-resigns'
          ? undefined
          : p.mockupBackUrl || svgToDataUrl(
              composeBackSvg({ garment: 'Classic Tee', color: garmentColor })
            );

        return {
          id: p.id,
          slug: p.slug,
          slogan: p.slogan,
          tier: p.tier,
          collectionSlug: p.collection.slug,
          colors,
          sizes,
          priceInr: Math.round(p.basePrice / 100),
          createdAt: p.createdAt,
          unitsSold: 0,
          mockupUrl,
          mockupBackUrl,
          mockupBgUrl,
          mockupBackBgUrl,
          galleryUrls: EXTRA_PRODUCT_IMAGES[p.slug] || [],
        } satisfies ShopProductView;
      });
    }
  } catch {
    // Connection failure fallback below
  }

  return FALLBACK_PRODUCTS;
}

export const FALLBACK_PRODUCTS: ShopProductView[] = [
    {
      id: 'prod-1',
      slug: 'notice-period-energy',
      slogan: 'NOTICE PERIOD ENERGY',
      tier: 'VERY_DIRECT',
      collectionSlug: 'operator',
      colors: ['Black', 'White'],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      priceInr: 1999,
      createdAt: new Date('2026-01-01'),
      unitsSold: 0,
      mockupUrl: '/products/notice-period-energy-full.jpg',
      galleryUrls: ['/products/notice-period-energy-ad-1.png', '/products/notice-period-energy-ad-2.png'],
    },
    {
      id: 'prod-2',
      slug: 'mute-is-my-crown',
      slogan: 'MUTE IS MY CROWN',
      tier: 'SAFE',
      collectionSlug: 'operator',
      colors: ['Black', 'White'],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      priceInr: 1999,
      createdAt: new Date('2026-01-01'),
      unitsSold: 0,
      mockupUrl: '/products/mute-is-my-crown-full.jpg',
      galleryUrls: ['/products/mute-is-my-crown-ad.png'],
    },
    {
      id: 'prod-3',
      slug: '9am-standups',
      slogan: '9AM STANDUPS SHOULD BE ILLEGAL',
      tier: 'DIRECT',
      collectionSlug: 'believer',
      colors: ['Black', 'White'],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      priceInr: 1999,
      createdAt: new Date('2026-01-01'),
      unitsSold: 0,
      mockupUrl: '/products/9am-standups-full.jpg',
      galleryUrls: ['/products/9am-standups-ad-1.png'],
    },
    {
      id: 'prod-4',
      slug: 'employee-resigns',
      slogan: 'EMPLOYEE RESIGNS ON TEAMS CALL',
      tier: 'VERY_DIRECT',
      collectionSlug: 'heretic',
      colors: ['Black', 'White'],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      priceInr: 2199,
      createdAt: new Date('2026-01-01'),
      unitsSold: 0,
      mockupUrl: '/products/employee-resigns-full.jpg',
      galleryUrls: ['/products/employee-resigns-ad-1.png'],
    },
    {
      id: 'prod-5',
      slug: 'boyfriend-wfh',
      slogan: 'MY BOYFRIEND IS WFH AND I WANT TO DIE',
      tier: 'DIRECT',
      collectionSlug: 'believer',
      colors: ['Black', 'White'],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      priceInr: 1999,
      createdAt: new Date('2026-01-01'),
      unitsSold: 0,
      mockupUrl: '/products/boyfriend-wfh-full.jpg',
      galleryUrls: ['/products/boyfriend-wfh-ad-1.png'],
    },
    {
      id: 'prod-6',
      slug: 'as-per-my-last-email',
      slogan: 'AS PER MY LAST EMAIL',
      tier: 'SAFE',
      collectionSlug: 'operator',
      colors: ['Black', 'White'],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      priceInr: 1999,
      createdAt: new Date('2026-01-01'),
      unitsSold: 0,
      mockupUrl: '/blank-black-tee.png',
      galleryUrls: [],
    },
    {
      id: 'prod-7',
      slug: 'synergy-overdose',
      slogan: 'SYNERGY OVERDOSE',
      tier: 'DIRECT',
      collectionSlug: 'believer',
      colors: ['Black', 'White'],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      priceInr: 1999,
      createdAt: new Date('2026-01-01'),
      unitsSold: 0,
      mockupUrl: '/blank-black-tee.png',
      galleryUrls: [],
    },
    {
      id: 'prod-8',
      slug: 'out-of-office-permanent',
      slogan: 'PERMANENTLY OUT OF OFFICE',
      tier: 'SAFE',
      collectionSlug: 'operator',
      colors: ['Black', 'White'],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      priceInr: 1999,
      createdAt: new Date('2026-01-01'),
      unitsSold: 0,
      mockupUrl: '/blank-black-tee.png',
      galleryUrls: [],
    },
    {
      id: 'prod-9',
      slug: 'pls-revert-back',
      slogan: 'KINDLY REVERT BACK NEVER',
      tier: 'DIRECT',
      collectionSlug: 'believer',
      colors: ['Black', 'White'],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      priceInr: 1999,
      createdAt: new Date('2026-01-01'),
      unitsSold: 0,
      mockupUrl: '/blank-black-tee.png',
      galleryUrls: [],
    },
    {
      id: 'prod-10',
      slug: 'quick-sync-trap',
      slogan: 'GOT A MINUTE FOR A QUICK SYNC?',
      tier: 'VERY_DIRECT',
      collectionSlug: 'heretic',
      colors: ['Black', 'White'],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      priceInr: 2199,
      createdAt: new Date('2026-01-01'),
      unitsSold: 0,
      mockupUrl: '/blank-black-tee.png',
      galleryUrls: [],
    },
  ];

/**
 * Load active collections for collection landing routes and navigation.
 * Returns `[]` if the database is unavailable.
 */
export async function getActiveCollections(): Promise<CollectionSummary[]> {
  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();
    const rows = await prisma.collection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: { slug: true, title: true, heroImage: true },
    });
    return rows.map((c) => ({
      slug: c.slug,
      title: c.title,
      heroImage: c.heroImage ?? undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Look up a single collection by slug for its landing page. Returns `null` when
 * absent or when the database is unavailable.
 */
export async function getCollectionBySlug(
  slug: string,
): Promise<CollectionSummary | null> {
  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();
    const row = await prisma.collection.findUnique({
      where: { slug },
      select: { slug: true, title: true, heroImage: true },
    });
    if (row === null) return null;
    return {
      slug: row.slug,
      title: row.title,
      heroImage: row.heroImage ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Load a single PUBLISHED product by slug together with its variants and owning
 * collection, mapped into the pure catalog domain types the PDP logic consumes.
 *
 * Returns `null` when the slug does not match a PUBLISHED product or when the
 * database is unavailable, so the PDP route can render a 404 rather than crash
 * (mirrors the graceful-degradation contract of the other data functions).
 */
export async function getProductBySlug(
  slug: string,
): Promise<ProductDetail | null> {
  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();
    const row = await prisma.product.findFirst({
      where: { slug, status: 'PUBLISHED' },
      include: {
        variants: true,
        collection: true,
      },
    });
    if (row) {
      const isWhite = row.variants.some((v) => v.color.toLowerCase().includes('white'));
      const presets = presetsForCollection(row.collection.slug, row.tier);
      const preset = CUSTOM_PRODUCT_PRESETS[row.slug] || presets[0] || SAFE_CLASSIC_PRESET;
      const layoutResult = fitText(row.slogan, { width: 380, height: 350 }, preset);
      const layout = layoutResult.ok ? layoutResult.value : { fontSize: 32, lines: [row.slogan], width: 300, height: 100, preset };
      const garmentColor = isWhite ? 'White' : 'Black';
      const mockupBgUrl = isWhite ? '/blank-white-tee.png' : '/blank-black-tee.png';
      const mockupBackBgUrl = isWhite ? '/blank-white-tee.png' : '/blank-black-tee.png';
      const mockupUrl = row.mockupUrl || svgToDataUrl(
        composePreviewSvg(layout, { garment: 'Classic Tee', color: garmentColor })
      );
      const mockupBackUrl = row.mockupBackUrl || svgToDataUrl(
        composeBackSvg({ garment: 'Classic Tee', color: garmentColor })
      );

      const product: Product = {
        id: row.id,
        slug: row.slug,
        slogan: row.slogan,
        tier: row.tier,
        collectionId: row.collectionId,
        status: row.status,
        basePrice: row.basePrice,
        aiGenerated: row.aiGenerated,
        fulfillmentMode: row.fulfillmentMode,
        seoTitle: row.seoTitle ?? undefined,
        seoDescription: row.seoDescription ?? undefined,
        mockupUrl,
        mockupBackUrl,
        mockupBgUrl,
        mockupBackBgUrl,
        galleryUrls: EXTRA_PRODUCT_IMAGES[row.slug] || [],
        createdAt: row.createdAt,
      };

      const variants: Variant[] = row.variants.map((v) => ({
        id: v.id,
        productId: v.productId,
        sku: v.sku,
        color: v.color,
        size: v.size,
        fit: v.fit,
        priceOverride: v.priceOverride ?? undefined,
        stock: v.stock,
        podVariantId: v.podVariantId ?? undefined,
      }));

      const collection: Collection = {
        id: row.collection.id,
        slug: row.collection.slug,
        title: row.collection.title,
        heroImage: row.collection.heroImage ?? undefined,
        sortOrder: row.collection.sortOrder,
        createdAt: row.collection.createdAt,
      };

      return { product, variants, collection };
    }
  } catch {
    // Fall back to static product detail if DB fails
  }

  const fallbackItem = FALLBACK_PRODUCTS.find((p) => p.slug === slug) || FALLBACK_PRODUCTS[0];
  if (!fallbackItem) return null;

  const mockVariants: Variant[] = [
    { id: 'var-1', productId: fallbackItem.id, sku: `${fallbackItem.slug}-blk-s`, color: 'Black', size: 'S', fit: 'Oversized', stock: 10 },
    { id: 'var-2', productId: fallbackItem.id, sku: `${fallbackItem.slug}-blk-m`, color: 'Black', size: 'M', fit: 'Oversized', stock: 10 },
    { id: 'var-3', productId: fallbackItem.id, sku: `${fallbackItem.slug}-blk-l`, color: 'Black', size: 'L', fit: 'Oversized', stock: 10 },
    { id: 'var-4', productId: fallbackItem.id, sku: `${fallbackItem.slug}-blk-xl`, color: 'Black', size: 'XL', fit: 'Oversized', stock: 10 },
    { id: 'var-5', productId: fallbackItem.id, sku: `${fallbackItem.slug}-wht-s`, color: 'White', size: 'S', fit: 'Oversized', stock: 10 },
    { id: 'var-6', productId: fallbackItem.id, sku: `${fallbackItem.slug}-wht-m`, color: 'White', size: 'M', fit: 'Oversized', stock: 10 },
    { id: 'var-7', productId: fallbackItem.id, sku: `${fallbackItem.slug}-wht-l`, color: 'White', size: 'L', fit: 'Oversized', stock: 10 },
    { id: 'var-8', productId: fallbackItem.id, sku: `${fallbackItem.slug}-wht-xl`, color: 'White', size: 'XL', fit: 'Oversized', stock: 10 },
  ];

  return {
    product: {
      id: fallbackItem.id,
      slug: fallbackItem.slug,
      slogan: fallbackItem.slogan,
      tier: fallbackItem.tier as any,
      collectionId: 'col-1',
      status: 'PUBLISHED',
      basePrice: fallbackItem.priceInr * 100,
      aiGenerated: false,
      fulfillmentMode: 'SELF',
      seoTitle: fallbackItem.slogan,
      seoDescription: `${fallbackItem.slogan}. Shop this tee from Out of Office.`,
      mockupUrl: fallbackItem.mockupUrl,
      galleryUrls: fallbackItem.galleryUrls,
      createdAt: fallbackItem.createdAt,
    },
    variants: mockVariants,
    collection: {
      id: 'col-1',
      slug: fallbackItem.collectionSlug,
      title: 'Out of Office Collection',
      sortOrder: 0,
      createdAt: new Date('2026-01-01'),
    },
  };
}
