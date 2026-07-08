/**
 * Catalog_Service — products, collections, variants, statuses, and tiers.
 *
 * This module owns catalog write and read logic and enforces the invariants of
 * Requirement 1:
 * - each product has exactly one Tier and exactly one Collection (Req 1.1, 1.2)
 * - product slug is unique across all products, 1..200 chars (Req 1.4, 1.11)
 * - variant SKU is unique across all variants, 1..64 chars (Req 1.5, 1.12)
 * - each variant has color/size/fit attributes (Req 1.6)
 * - product status ∈ {DRAFT, PENDING_REVIEW, PUBLISHED, ARCHIVED} (Req 1.7)
 * - customer-facing display returns only PUBLISHED products (Req 1.8)
 * - base price / price override are integer paise 0..99,999,999 (Req 1.9)
 * - variant stock is an integer 0..1,000,000 (Req 1.10)
 *
 * Monetary values are validated through the Money module so the paise
 * closure/range guarantees stay in one place (Req 26). Persistence is isolated
 * behind an in-memory {@link CatalogStore} so the domain logic is pure and
 * testable without a database; a Prisma-backed store can implement the same
 * interface later.
 */

import { type Result, ok, err } from '../lib/result';
import { makePaise } from '../lib/money';

// ---------------------------------------------------------------------------
// Domain types (mirroring the Prisma models in prisma/schema.prisma)
// ---------------------------------------------------------------------------

export type Id = string;

export type Tier = 'SAFE' | 'DIRECT' | 'VERY_DIRECT';
export type ProductStatus = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type FulfillmentMode = 'SELF' | 'POD';

export const TIERS: readonly Tier[] = ['SAFE', 'DIRECT', 'VERY_DIRECT'];
export const PRODUCT_STATUSES: readonly ProductStatus[] = [
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'ARCHIVED',
];
export const FULFILLMENT_MODES: readonly FulfillmentMode[] = ['SELF', 'POD'];

export interface Collection {
  id: Id;
  slug: string;
  title: string;
  heroImage?: string;
  sortOrder: number;
  createdAt: Date;
}

export interface Product {
  id: Id;
  slug: string;
  slogan: string;
  tier: Tier;
  collectionId: Id;
  status: ProductStatus;
  basePrice: number; // integer paise 0..99,999,999
  aiGenerated: boolean;
  fulfillmentMode: FulfillmentMode;
  seoTitle?: string;
  seoDescription?: string;
  mockupUrl?: string;
  mockupBackUrl?: string;
  createdAt: Date;
}

export interface Variant {
  id: Id;
  productId: Id;
  sku: string;
  color: string;
  size: string;
  fit: string;
  priceOverride?: number; // integer paise 0..99,999,999
  stock: number; // integer 0..1,000,000
  podVariantId?: string;
}

export interface ProductInput {
  slug: string;
  slogan: string;
  tier: Tier;
  collectionId: Id;
  basePrice: number;
  status?: ProductStatus;
  aiGenerated?: boolean;
  fulfillmentMode?: FulfillmentMode;
  seoTitle?: string;
  seoDescription?: string;
  mockupUrl?: string;
}

export interface VariantInput {
  productId: Id;
  sku: string;
  color: string;
  size: string;
  fit: string;
  priceOverride?: number;
  stock?: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Discriminated error describing why a catalog operation was rejected. */
export type CatalogError =
  | { readonly kind: 'SLUG_IN_USE'; readonly message: string }
  | { readonly kind: 'SKU_IN_USE'; readonly message: string }
  | { readonly kind: 'VARIANT_TUPLE_IN_USE'; readonly message: string }
  | { readonly kind: 'SLUG_LENGTH'; readonly message: string }
  | { readonly kind: 'SKU_LENGTH'; readonly message: string }
  | { readonly kind: 'MISSING_FIELD'; readonly message: string }
  | { readonly kind: 'INVALID_TIER'; readonly message: string }
  | { readonly kind: 'INVALID_STATUS'; readonly message: string }
  | { readonly kind: 'INVALID_FULFILLMENT_MODE'; readonly message: string }
  | { readonly kind: 'PRICE_OUT_OF_RANGE'; readonly message: string }
  | { readonly kind: 'STOCK_OUT_OF_RANGE'; readonly message: string }
  | { readonly kind: 'COLLECTION_NOT_FOUND'; readonly message: string }
  | { readonly kind: 'PRODUCT_NOT_FOUND'; readonly message: string };

// ---------------------------------------------------------------------------
// Value-range bounds (Requirement 1)
// ---------------------------------------------------------------------------

export const SLUG_MIN = 1;
export const SLUG_MAX = 200; // Req 1.4
export const SKU_MIN = 1;
export const SKU_MAX = 64; // Req 1.5
export const PRODUCT_PRICE_MIN = 0;
export const PRODUCT_PRICE_MAX = 99_999_999; // Req 1.9
export const STOCK_MIN = 0;
export const STOCK_MAX = 1_000_000; // Req 1.10

// ---------------------------------------------------------------------------
// Store abstraction (persistence isolated behind an interface)
// ---------------------------------------------------------------------------

/**
 * In-memory catalog store. The service reads and writes through this structure
 * so the domain logic stays pure and unit/property testable. A Prisma-backed
 * adapter can implement equivalent behavior against PostgreSQL.
 */
export interface CatalogStore {
  readonly products: Map<Id, Product>;
  readonly variants: Map<Id, Variant>;
  readonly collections: Map<Id, Collection>;
}

/** Create an empty in-memory catalog store, optionally seeded with data. */
export function createInMemoryCatalogStore(seed?: {
  products?: Product[];
  variants?: Variant[];
  collections?: Collection[];
}): CatalogStore {
  const store: CatalogStore = {
    products: new Map(),
    variants: new Map(),
    collections: new Map(),
  };
  for (const c of seed?.collections ?? []) store.collections.set(c.id, c);
  for (const p of seed?.products ?? []) store.products.set(p.id, p);
  for (const v of seed?.variants ?? []) store.variants.set(v.id, v);
  return store;
}

export interface CatalogServiceOptions {
  /** Injected clock for deterministic `createdAt` values in tests. */
  now?: () => Date;
  /** Injected id generator; defaults to `crypto.randomUUID`. */
  idGenerator?: () => Id;
}

export interface Catalog_Service {
  createProduct(input: ProductInput): Result<Product, CatalogError>;
  createVariant(input: VariantInput): Result<Variant, CatalogError>;
  getPublishedForDisplay(): Product[];
  transitionStatus(
    productId: Id,
    next: ProductStatus,
  ): Result<Product, CatalogError>;
}

// ---------------------------------------------------------------------------
// Internal validation helpers
// ---------------------------------------------------------------------------

function guardPaiseField(
  value: number,
  fieldLabel: string,
): Result<number, CatalogError> {
  // Reuse the Money module so integer-only + non-negative rules live in one
  // place, then apply the tighter per-field product bound (Req 1.9, 26.1).
  const paise = makePaise(value);
  if (!paise.ok) {
    return err({
      kind: 'PRICE_OUT_OF_RANGE',
      message: `${fieldLabel} must be an integer paise value: ${paise.error.message}`,
    });
  }
  if (value > PRODUCT_PRICE_MAX) {
    return err({
      kind: 'PRICE_OUT_OF_RANGE',
      message: `${fieldLabel} ${value} exceeds the maximum of ${PRODUCT_PRICE_MAX} paise`,
    });
  }
  return ok(value);
}

function guardStock(value: number): Result<number, CatalogError> {
  if (!Number.isInteger(value)) {
    return err({
      kind: 'STOCK_OUT_OF_RANGE',
      message: `Stock must be an integer, received ${value}`,
    });
  }
  if (value < STOCK_MIN || value > STOCK_MAX) {
    return err({
      kind: 'STOCK_OUT_OF_RANGE',
      message: `Stock ${value} is outside the range ${STOCK_MIN}..${STOCK_MAX}`,
    });
  }
  return ok(value);
}

function variantTupleKey(productId: Id, color: string, size: string, fit: string): string {
  return `${productId}\u0000${color}\u0000${size}\u0000${fit}`;
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

/**
 * Create a Catalog_Service bound to the given store. When no store is supplied
 * a fresh in-memory store is created.
 */
export function createCatalogService(
  store: CatalogStore = createInMemoryCatalogStore(),
  options: CatalogServiceOptions = {},
): Catalog_Service {
  const now = options.now ?? (() => new Date());
  const nextId =
    options.idGenerator ??
    (() => {
      // crypto.randomUUID is available in Node 16+ and modern browsers.
      return globalThis.crypto.randomUUID();
    });

  return {
    createProduct(input: ProductInput): Result<Product, CatalogError> {
      // Slug length bounds (Req 1.4).
      if (input.slug.length < SLUG_MIN || input.slug.length > SLUG_MAX) {
        return err({
          kind: 'SLUG_LENGTH',
          message: `Slug must be ${SLUG_MIN}..${SLUG_MAX} characters, received length ${input.slug.length}`,
        });
      }

      // Required text fields (Req 1.1 product must carry a slogan/tier).
      if (input.slogan.trim().length === 0) {
        return err({ kind: 'MISSING_FIELD', message: 'Product slogan is required' });
      }

      // Exactly one tier from the allowed set (Req 1.1).
      if (!TIERS.includes(input.tier)) {
        return err({
          kind: 'INVALID_TIER',
          message: `Tier must be one of ${TIERS.join(', ')}, received ${String(input.tier)}`,
        });
      }

      // Status defaults to DRAFT and must be from the allowed set (Req 1.7).
      const status = input.status ?? 'DRAFT';
      if (!PRODUCT_STATUSES.includes(status)) {
        return err({
          kind: 'INVALID_STATUS',
          message: `Status must be one of ${PRODUCT_STATUSES.join(', ')}, received ${String(status)}`,
        });
      }

      const fulfillmentMode = input.fulfillmentMode ?? 'SELF';
      if (!FULFILLMENT_MODES.includes(fulfillmentMode)) {
        return err({
          kind: 'INVALID_FULFILLMENT_MODE',
          message: `Fulfillment mode must be one of ${FULFILLMENT_MODES.join(', ')}, received ${String(fulfillmentMode)}`,
        });
      }

      // Base price is integer paise within the product bound (Req 1.9).
      const priceGuard = guardPaiseField(input.basePrice, 'Base price');
      if (!priceGuard.ok) return priceGuard;

      // Exactly one Collection, which must exist (Req 1.2, 1.3).
      if (input.collectionId.trim().length === 0) {
        return err({ kind: 'MISSING_FIELD', message: 'Product collection is required' });
      }
      if (!store.collections.has(input.collectionId)) {
        return err({
          kind: 'COLLECTION_NOT_FOUND',
          message: `Collection ${input.collectionId} does not exist`,
        });
      }

      // Reject duplicate slug and leave the existing product unchanged (Req 1.11).
      for (const existing of store.products.values()) {
        if (existing.slug === input.slug) {
          return err({
            kind: 'SLUG_IN_USE',
            message: `Slug "${input.slug}" is already in use`,
          });
        }
      }

      const product: Product = {
        id: nextId(),
        slug: input.slug,
        slogan: input.slogan,
        tier: input.tier,
        collectionId: input.collectionId,
        status,
        basePrice: input.basePrice,
        aiGenerated: input.aiGenerated ?? false,
        fulfillmentMode,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        mockupUrl: input.mockupUrl,
        createdAt: now(),
      };
      store.products.set(product.id, product);
      return ok(product);
    },

    createVariant(input: VariantInput): Result<Variant, CatalogError> {
      // SKU length bounds (Req 1.5).
      if (input.sku.length < SKU_MIN || input.sku.length > SKU_MAX) {
        return err({
          kind: 'SKU_LENGTH',
          message: `SKU must be ${SKU_MIN}..${SKU_MAX} characters, received length ${input.sku.length}`,
        });
      }

      // The owning product must exist.
      if (!store.products.has(input.productId)) {
        return err({
          kind: 'PRODUCT_NOT_FOUND',
          message: `Product ${input.productId} does not exist`,
        });
      }

      // Color, size, and fit attributes are required (Req 1.6).
      if (input.color.trim().length === 0) {
        return err({ kind: 'MISSING_FIELD', message: 'Variant color is required' });
      }
      if (input.size.trim().length === 0) {
        return err({ kind: 'MISSING_FIELD', message: 'Variant size is required' });
      }
      if (input.fit.trim().length === 0) {
        return err({ kind: 'MISSING_FIELD', message: 'Variant fit is required' });
      }

      // Optional price override is integer paise within the product bound (Req 1.9).
      if (input.priceOverride !== undefined) {
        const overrideGuard = guardPaiseField(input.priceOverride, 'Price override');
        if (!overrideGuard.ok) return overrideGuard;
      }

      // Stock defaults to 0 and stays within range (Req 1.10).
      const stock = input.stock ?? 0;
      const stockGuard = guardStock(stock);
      if (!stockGuard.ok) return stockGuard;

      // Reject duplicate SKU and leave the existing variant unchanged (Req 1.12).
      for (const existing of store.variants.values()) {
        if (existing.sku === input.sku) {
          return err({
            kind: 'SKU_IN_USE',
            message: `SKU "${input.sku}" is already in use`,
          });
        }
      }

      // Enforce the (product, color, size, fit) uniqueness tuple (Req 16.4).
      const tupleKey = variantTupleKey(
        input.productId,
        input.color,
        input.size,
        input.fit,
      );
      for (const existing of store.variants.values()) {
        if (
          variantTupleKey(
            existing.productId,
            existing.color,
            existing.size,
            existing.fit,
          ) === tupleKey
        ) {
          return err({
            kind: 'VARIANT_TUPLE_IN_USE',
            message: `A variant for this product with color/size/fit (${input.color}/${input.size}/${input.fit}) already exists`,
          });
        }
      }

      const variant: Variant = {
        id: nextId(),
        productId: input.productId,
        sku: input.sku,
        color: input.color,
        size: input.size,
        fit: input.fit,
        priceOverride: input.priceOverride,
        stock,
        podVariantId: undefined,
      };
      store.variants.set(variant.id, variant);
      return ok(variant);
    },

    getPublishedForDisplay(): Product[] {
      // Customer-facing display returns only PUBLISHED products (Req 1.8),
      // ordered newest-first as a sensible default (faceted filtering and
      // pagination are layered on top by the Shop_UI).
      return [...store.products.values()]
        .filter((p) => p.status === 'PUBLISHED')
        .sort((a, b) => {
          const diff = b.createdAt.getTime() - a.createdAt.getTime();
          return diff !== 0 ? diff : a.id.localeCompare(b.id);
        });
    },

    transitionStatus(
      productId: Id,
      next: ProductStatus,
    ): Result<Product, CatalogError> {
      if (!PRODUCT_STATUSES.includes(next)) {
        return err({
          kind: 'INVALID_STATUS',
          message: `Status must be one of ${PRODUCT_STATUSES.join(', ')}, received ${String(next)}`,
        });
      }
      const product = store.products.get(productId);
      if (product === undefined) {
        return err({
          kind: 'PRODUCT_NOT_FOUND',
          message: `Product ${productId} does not exist`,
        });
      }
      const updated: Product = { ...product, status: next };
      store.products.set(product.id, updated);
      return ok(updated);
    },
  };
}
