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
import { composePreviewSvg, svgToDataUrl } from './mockup-data';

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

    return rows.map((p) => {
      const colors = [...new Set(p.variants.map((v) => v.color))].sort();
      const sizes = [...new Set(p.variants.map((v) => v.size))].sort();
      const isWhite = colors.some((c) => c.toLowerCase().includes('white'));
      const presets = presetsForCollection(p.collection.slug, p.tier);
      const preset = presets[0] ?? SAFE_CLASSIC_PRESET;
      const layoutResult = fitText(p.slogan, { width: 380, height: 350 }, preset);
      const layout = layoutResult.ok ? layoutResult.value : { fontSize: 32, lines: [p.slogan], width: 300, height: 100, preset };
      const mockupUrl = svgToDataUrl(
        composePreviewSvg(layout, { garment: 'Classic Tee', color: isWhite ? 'White' : 'Black' })
      );

      return {
        id: p.id,
        slug: p.slug,
        slogan: p.slogan,
        tier: p.tier,
        collectionSlug: p.collection.slug,
        colors,
        sizes,
        // basePrice is integer paise; expose whole INR for the price facet.
        priceInr: Math.round(p.basePrice / 100),
        createdAt: p.createdAt,
        unitsSold: 0,
        mockupUrl,
      } satisfies ShopProductView;
    });
  } catch {
    // No live DB / connection failure: degrade to an empty catalog so the
    // page renders its empty state rather than crashing the build or request.
    return [];
  }
}

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
    if (row === null) return null;

    const isWhite = row.variants.some((v) => v.color.toLowerCase().includes('white'));
    const presets = presetsForCollection(row.collection.slug, row.tier);
    const preset = presets[0] ?? SAFE_CLASSIC_PRESET;
    const layoutResult = fitText(row.slogan, { width: 380, height: 350 }, preset);
    const layout = layoutResult.ok ? layoutResult.value : { fontSize: 32, lines: [row.slogan], width: 300, height: 100, preset };
    const mockupUrl = svgToDataUrl(
      composePreviewSvg(layout, { garment: 'Classic Tee', color: isWhite ? 'White' : 'Black' })
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
  } catch {
    return null;
  }
}
