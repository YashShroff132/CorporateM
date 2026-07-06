import { describe, expect, it } from 'vitest';
import {
  createCatalogService,
  createInMemoryCatalogStore,
  type Collection,
  type Product,
} from './catalog';

/**
 * Unit tests for Catalog_Service (task 3.1). These cover concrete examples and
 * edge cases for Requirement 1. Universal properties are covered separately by
 * the optional property-test task 3.2.
 */

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'col-1',
    slug: 'operator',
    title: 'Operator',
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function serviceWithCollection() {
  const store = createInMemoryCatalogStore({ collections: [makeCollection()] });
  const service = createCatalogService(store, {
    now: () => new Date('2026-01-02T00:00:00Z'),
  });
  return { store, service };
}

const validProductInput = {
  slug: 'notice-period-energy',
  slogan: 'Notice Period Energy',
  tier: 'VERY_DIRECT' as const,
  collectionId: 'col-1',
  basePrice: 79_900,
};

describe('Catalog_Service.createProduct', () => {
  it('creates a product with exactly one tier and one collection', () => {
    const { service } = serviceWithCollection();
    const result = service.createProduct(validProductInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tier).toBe('VERY_DIRECT');
      expect(result.value.collectionId).toBe('col-1');
      expect(result.value.status).toBe('DRAFT');
      expect(result.value.fulfillmentMode).toBe('SELF');
    }
  });

  it('rejects a duplicate slug and leaves the existing product unchanged', () => {
    const { store, service } = serviceWithCollection();
    const first = service.createProduct(validProductInput);
    expect(first.ok).toBe(true);
    const countBefore = store.products.size;

    const dup = service.createProduct({
      ...validProductInput,
      slogan: 'A different slogan',
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.kind).toBe('SLUG_IN_USE');
    expect(store.products.size).toBe(countBefore);
  });

  it('accepts slug lengths at the 1 and 200 bounds and rejects outside', () => {
    const { service } = serviceWithCollection();
    expect(service.createProduct({ ...validProductInput, slug: 'a' }).ok).toBe(true);
    expect(
      service.createProduct({ ...validProductInput, slug: 'b'.repeat(200) }).ok,
    ).toBe(true);
    expect(service.createProduct({ ...validProductInput, slug: '' }).ok).toBe(false);
    const tooLong = service.createProduct({
      ...validProductInput,
      slug: 'c'.repeat(201),
    });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error.kind).toBe('SLUG_LENGTH');
  });

  it('rejects a base price outside 0..99,999,999 paise or non-integer', () => {
    const { service } = serviceWithCollection();
    expect(
      service.createProduct({ ...validProductInput, basePrice: 100_000_000 }).ok,
    ).toBe(false);
    expect(
      service.createProduct({ ...validProductInput, basePrice: -1 }).ok,
    ).toBe(false);
    const fractional = service.createProduct({
      ...validProductInput,
      basePrice: 10.5,
    });
    expect(fractional.ok).toBe(false);
    if (!fractional.ok) expect(fractional.error.kind).toBe('PRICE_OUT_OF_RANGE');
    // Boundary values are accepted.
    expect(service.createProduct({ ...validProductInput, basePrice: 0 }).ok).toBe(true);
    expect(
      service.createProduct({
        ...validProductInput,
        slug: 'max-price',
        basePrice: 99_999_999,
      }).ok,
    ).toBe(true);
  });

  it('rejects an unknown collection', () => {
    const { service } = serviceWithCollection();
    const result = service.createProduct({
      ...validProductInput,
      collectionId: 'missing',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('COLLECTION_NOT_FOUND');
  });
});

describe('Catalog_Service.createVariant', () => {
  function serviceWithProduct() {
    const { store, service } = serviceWithCollection();
    const product = service.createProduct(validProductInput);
    if (!product.ok) throw new Error('setup failed');
    return { store, service, product: product.value };
  }

  const variantInput = (product: Product) => ({
    productId: product.id,
    sku: 'NPE-BLK-M-REG',
    color: 'Black',
    size: 'M',
    fit: 'Regular',
    stock: 10,
  });

  it('creates a variant with color/size/fit and default stock 0', () => {
    const { service, product } = serviceWithProduct();
    const result = service.createVariant({
      productId: product.id,
      sku: 'NPE-WHT-S-SLIM',
      color: 'White',
      size: 'S',
      fit: 'Slim',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stock).toBe(0);
      expect(result.value.color).toBe('White');
    }
  });

  it('rejects a duplicate SKU and leaves the existing variant unchanged', () => {
    const { store, service, product } = serviceWithProduct();
    expect(service.createVariant(variantInput(product)).ok).toBe(true);
    const countBefore = store.variants.size;
    const dup = service.createVariant({
      ...variantInput(product),
      color: 'Navy',
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.kind).toBe('SKU_IN_USE');
    expect(store.variants.size).toBe(countBefore);
  });

  it('accepts SKU at 1 and 64 bounds and rejects outside', () => {
    const { service, product } = serviceWithProduct();
    expect(
      service.createVariant({ ...variantInput(product), sku: 'x' }).ok,
    ).toBe(true);
    expect(
      service.createVariant({
        ...variantInput(product),
        sku: 'y'.repeat(64),
        color: 'Grey',
      }).ok,
    ).toBe(true);
    const tooLong = service.createVariant({
      ...variantInput(product),
      sku: 'z'.repeat(65),
      color: 'Red',
    });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error.kind).toBe('SKU_LENGTH');
  });

  it('rejects stock outside 0..1,000,000', () => {
    const { service, product } = serviceWithProduct();
    const over = service.createVariant({
      ...variantInput(product),
      stock: 1_000_001,
    });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.kind).toBe('STOCK_OUT_OF_RANGE');
  });

  it('rejects a duplicate color/size/fit tuple for the same product', () => {
    const { service, product } = serviceWithProduct();
    expect(service.createVariant(variantInput(product)).ok).toBe(true);
    const dupTuple = service.createVariant({
      ...variantInput(product),
      sku: 'DIFFERENT-SKU',
    });
    expect(dupTuple.ok).toBe(false);
    if (!dupTuple.ok) expect(dupTuple.error.kind).toBe('VARIANT_TUPLE_IN_USE');
  });
});

describe('Catalog_Service.getPublishedForDisplay', () => {
  it('returns only PUBLISHED products', () => {
    const { service } = serviceWithCollection();
    const statuses = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;
    statuses.forEach((status, i) => {
      const created = service.createProduct({
        ...validProductInput,
        slug: `product-${i}`,
      });
      if (created.ok) service.transitionStatus(created.value.id, status);
    });

    const displayed = service.getPublishedForDisplay();
    expect(displayed.length).toBe(1);
    expect(displayed.every((p) => p.status === 'PUBLISHED')).toBe(true);
  });
});

describe('Catalog_Service.transitionStatus', () => {
  it('updates a product status', () => {
    const { service } = serviceWithCollection();
    const created = service.createProduct(validProductInput);
    if (!created.ok) throw new Error('setup failed');
    const result = service.transitionStatus(created.value.id, 'PUBLISHED');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('PUBLISHED');
  });

  it('rejects a transition for an unknown product', () => {
    const { service } = serviceWithCollection();
    const result = service.transitionStatus('nope', 'PUBLISHED');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('PRODUCT_NOT_FOUND');
  });
});
