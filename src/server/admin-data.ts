/**
 * Admin data-access layer — the only place the admin panel touches the database
 * for catalog mutations and reads. Mirrors the isolation pattern of
 * `shop-data.ts`: pages/actions depend on these functions, not on Prisma
 * directly, and every read degrades gracefully (returns empty/`null`) when no
 * live database is reachable so `next build` never crashes.
 *
 * Money is stored as integer paise. Callers pass rupees; conversion to paise
 * happens in the action layer via {@link rupeesToPaise}.
 *
 * Every mutation writes an append-only AuditLog row (Req 11.2) with
 * actorId='admin'.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

import { ADMIN_ACTOR_ID } from './admin-auth';

/** Discriminated result for admin mutations consumed by server actions. */
export type AdminResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly field?: string; readonly message: string };

/** Sentinel thrown/returned when the database is unreachable. */
export const DB_UNAVAILABLE = 'DB_UNAVAILABLE' as const;

async function client(): Promise<PrismaClient> {
  const { getPrisma } = await import('@/lib/prisma');
  return getPrisma();
}

/** Convert an integer paise amount to a rupees string for display (no symbol). */
export function paiseToRupeesString(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const fraction = paise % 100;
  return `${rupees}.${fraction < 10 ? `0${fraction}` : `${fraction}`}`;
}

/** Convert integer paise to a plain rupees number for form value display. */
export function paiseToRupeesNumber(paise: number): number {
  return paise / 100;
}

/**
 * Convert a rupees value (number) to integer paise. Rounds to the nearest paise
 * to absorb floating-point input like 199.99 → 19999.
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Detect a Prisma unique-constraint violation (P2002). */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

/** Write an append-only audit row; best-effort (never throws to the caller). */
async function writeAudit(
  prisma: PrismaClient,
  actionType: string,
  entityType: string,
  entityId: string,
  detail: Prisma.InputJsonValue,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: ADMIN_ACTOR_ID,
        actionType,
        entityType,
        entityId,
        detail,
      },
    });
  } catch {
    // Auditing is best-effort; do not fail the mutation if the log write fails.
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardCounts {
  products: number;
  published: number;
  collections: number;
  lowStockVariants: number;
  available: boolean;
}

/** Low-stock threshold: variants at or below this count are flagged. */
export const LOW_STOCK_THRESHOLD = 5;

export async function getDashboardCounts(): Promise<DashboardCounts> {
  try {
    const prisma = await client();
    const [products, published, collections, lowStockVariants] =
      await Promise.all([
        prisma.product.count(),
        prisma.product.count({ where: { status: 'PUBLISHED' } }),
        prisma.collection.count(),
        prisma.variant.count({ where: { stock: { lte: LOW_STOCK_THRESHOLD } } }),
      ]);
    return {
      products,
      published,
      collections,
      lowStockVariants,
      available: true,
    };
  } catch {
    return {
      products: 0,
      published: 0,
      collections: 0,
      lowStockVariants: 0,
      available: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export interface AdminCollection {
  id: string;
  slug: string;
  title: string;
  heroImage: string | null;
  sortOrder: number;
  productCount: number;
}

export async function listCollections(): Promise<
  AdminCollection[] | typeof DB_UNAVAILABLE
> {
  try {
    const prisma = await client();
    const rows = await prisma.collection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      heroImage: c.heroImage,
      sortOrder: c.sortOrder,
      productCount: c._count.products,
    }));
  } catch {
    return DB_UNAVAILABLE;
  }
}

export async function getCollection(
  id: string,
): Promise<AdminCollection | null | typeof DB_UNAVAILABLE> {
  try {
    const prisma = await client();
    const c = await prisma.collection.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (c === null) return null;
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      heroImage: c.heroImage,
      sortOrder: c.sortOrder,
      productCount: c._count.products,
    };
  } catch {
    return DB_UNAVAILABLE;
  }
}

export interface CollectionData {
  slug: string;
  title: string;
  heroImage: string | null;
  sortOrder: number;
}

export async function createCollection(
  data: CollectionData,
): Promise<AdminResult> {
  try {
    const prisma = await client();
    const created = await prisma.collection.create({ data });
    await writeAudit(prisma, 'CREATE', 'Collection', created.id, {
      slug: created.slug,
      title: created.title,
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, field: 'slug', message: 'Slug is already in use.' };
    }
    return {
      ok: false,
      message: 'Database not connected — could not save the collection.',
    };
  }
}

export async function updateCollection(
  id: string,
  data: CollectionData,
): Promise<AdminResult> {
  try {
    const prisma = await client();
    const updated = await prisma.collection.update({ where: { id }, data });
    await writeAudit(prisma, 'UPDATE', 'Collection', updated.id, {
      slug: updated.slug,
      title: updated.title,
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, field: 'slug', message: 'Slug is already in use.' };
    }
    return {
      ok: false,
      message: 'Database not connected — could not save the collection.',
    };
  }
}

export async function deleteCollection(id: string): Promise<AdminResult> {
  try {
    const prisma = await client();
    const count = await prisma.product.count({ where: { collectionId: id } });
    if (count > 0) {
      return {
        ok: false,
        message: `Cannot delete: ${count} product(s) still belong to this collection.`,
      };
    }
    await prisma.collection.delete({ where: { id } });
    await writeAudit(prisma, 'DELETE', 'Collection', id, {});
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: 'Database not connected — could not delete the collection.',
    };
  }
}

/** Minimal collection option list for product form selects. */
export async function listCollectionOptions(): Promise<
  { id: string; title: string; slug: string }[]
> {
  try {
    const prisma = await client();
    const rows = await prisma.collection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: { id: true, title: true, slug: true },
    });
    return rows;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export type Tier = 'SAFE' | 'DIRECT' | 'VERY_DIRECT';
export type ProductStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'PUBLISHED'
  | 'ARCHIVED';

export interface AdminProductRow {
  id: string;
  slug: string;
  slogan: string;
  tier: Tier;
  status: ProductStatus;
  basePrice: number;
  collectionTitle: string;
  variantCount: number;
}

export async function listProducts(): Promise<
  AdminProductRow[] | typeof DB_UNAVAILABLE
> {
  try {
    const prisma = await client();
    const rows = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        collection: { select: { title: true } },
        _count: { select: { variants: true } },
      },
    });
    return rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      slogan: p.slogan,
      tier: p.tier,
      status: p.status,
      basePrice: p.basePrice,
      collectionTitle: p.collection.title,
      variantCount: p._count.variants,
    }));
  } catch {
    return DB_UNAVAILABLE;
  }
}

export interface AdminProductDetail {
  id: string;
  slug: string;
  slogan: string;
  tier: Tier;
  collectionId: string;
  status: ProductStatus;
  basePrice: number;
  seoTitle: string | null;
  seoDescription: string | null;
  mockupUrl: string | null;
  variants: AdminVariant[];
}

export interface AdminVariant {
  id: string;
  sku: string;
  color: string;
  size: string;
  fit: string;
  priceOverride: number | null;
  stock: number;
}

export async function getProduct(
  id: string,
): Promise<AdminProductDetail | null | typeof DB_UNAVAILABLE> {
  try {
    const prisma = await client();
    const p = await prisma.product.findUnique({
      where: { id },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
    if (p === null) return null;
    return {
      id: p.id,
      slug: p.slug,
      slogan: p.slogan,
      tier: p.tier,
      collectionId: p.collectionId,
      status: p.status,
      basePrice: p.basePrice,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      mockupUrl: p.mockupUrl,
      variants: p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        color: v.color,
        size: v.size,
        fit: v.fit,
        priceOverride: v.priceOverride,
        stock: v.stock,
      })),
    };
  } catch {
    return DB_UNAVAILABLE;
  }
}

export interface ProductData {
  slug: string;
  slogan: string;
  tier: Tier;
  collectionId: string;
  status: ProductStatus;
  basePrice: number; // paise
  seoTitle: string | null;
  seoDescription: string | null;
  mockupUrl: string | null;
}

export async function createProduct(data: ProductData): Promise<AdminResult> {
  try {
    const prisma = await client();
    const created = await prisma.product.create({ data });
    await writeAudit(prisma, 'CREATE', 'Product', created.id, {
      slug: created.slug,
      status: created.status,
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, field: 'slug', message: 'Slug is already in use.' };
    }
    return {
      ok: false,
      message: 'Database not connected — could not save the product.',
    };
  }
}

export async function updateProduct(
  id: string,
  data: ProductData,
): Promise<AdminResult> {
  try {
    const prisma = await client();
    const updated = await prisma.product.update({ where: { id }, data });
    await writeAudit(prisma, 'UPDATE', 'Product', updated.id, {
      slug: updated.slug,
      status: updated.status,
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, field: 'slug', message: 'Slug is already in use.' };
    }
    return {
      ok: false,
      message: 'Database not connected — could not save the product.',
    };
  }
}

export async function deleteProduct(id: string): Promise<AdminResult> {
  try {
    const prisma = await client();
    await prisma.product.delete({ where: { id } });
    await writeAudit(prisma, 'DELETE', 'Product', id, {});
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: 'Database not connected — could not delete the product.',
    };
  }
}

export async function setProductStatus(
  id: string,
  status: ProductStatus,
): Promise<AdminResult> {
  try {
    const prisma = await client();
    const updated = await prisma.product.update({
      where: { id },
      data: { status },
    });
    await writeAudit(prisma, 'STATUS_CHANGE', 'Product', updated.id, {
      status,
    });
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: 'Database not connected — could not change status.',
    };
  }
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export interface VariantData {
  sku: string;
  color: string;
  size: string;
  fit: string;
  priceOverride: number | null; // paise
  stock: number;
}

export async function createVariant(
  productId: string,
  data: VariantData,
): Promise<AdminResult> {
  try {
    const prisma = await client();
    const created = await prisma.variant.create({
      data: { productId, ...data },
    });
    await writeAudit(prisma, 'CREATE', 'Variant', created.id, {
      sku: created.sku,
      productId,
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        ok: false,
        field: 'sku',
        message: 'SKU or color/size/fit combination is already in use.',
      };
    }
    return {
      ok: false,
      message: 'Database not connected — could not save the variant.',
    };
  }
}

export async function updateVariant(
  id: string,
  data: VariantData,
): Promise<AdminResult> {
  try {
    const prisma = await client();
    const updated = await prisma.variant.update({ where: { id }, data });
    await writeAudit(prisma, 'UPDATE', 'Variant', updated.id, {
      sku: updated.sku,
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        ok: false,
        field: 'sku',
        message: 'SKU or color/size/fit combination is already in use.',
      };
    }
    return {
      ok: false,
      message: 'Database not connected — could not save the variant.',
    };
  }
}

export async function deleteVariant(id: string): Promise<AdminResult> {
  try {
    const prisma = await client();
    await prisma.variant.delete({ where: { id } });
    await writeAudit(prisma, 'DELETE', 'Variant', id, {});
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: 'Database not connected — could not delete the variant.',
    };
  }
}
