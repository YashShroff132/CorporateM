import { describe, expect, it } from 'vitest';
import { createConfigService } from './config';
import type { Collection, Product, Variant } from './catalog';
import {
  TIER_LABELS,
  buildPdpViewModel,
  buildSizeGuide,
  buildTierBadge,
  buildTrustRow,
  evaluatePurchase,
  isSelectionComplete,
  isVariantAvailable,
  listVariantOptions,
  missingSelections,
  requiredDimensions,
  resolveVariant,
  selectCrossSell,
  showsSpicyIndicator,
  variantPricePaise,
  formatPriceInr,
  type SizeMeasurements,
  type VariantSelection,
} from './pdp';

/**
 * Unit tests for PDP domain logic (task 5.1). These cover concrete examples and
 * edge cases for Requirement 3 (variant availability, purchase-action gating,
 * tier/spicy badges, size guide, cross-sell, and trust row). Universal
 * properties are covered separately by the optional property-test task 5.3.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    slug: 'notice-period-energy',
    slogan: 'Notice Period Energy',
    tier: 'VERY_DIRECT',
    collectionId: 'col-1',
    status: 'PUBLISHED',
    basePrice: 79_900,
    aiGenerated: false,
    fulfillmentMode: 'SELF',
    createdAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

let variantSeq = 0;
function makeVariant(overrides: Partial<Variant> = {}): Variant {
  variantSeq += 1;
  return {
    id: `var-${variantSeq}`,
    productId: 'prod-1',
    sku: `SKU-${variantSeq}`,
    color: 'Black',
    size: 'M',
    fit: 'Regular',
    stock: 10,
    ...overrides,
  };
}

const completeSelection: VariantSelection = {
  color: 'Black',
  size: 'M',
  fit: 'Regular',
};

function configWithEnv(env: Record<string, string | undefined> = {}) {
  return createConfigService({
    CROSS_SELL_COUNT: '4',
    RETURNS_WINDOW: '7 days',
    DISPATCH_TIME: '2-3 business days',
    ...env,
  });
}

// ---------------------------------------------------------------------------
// Tier badge & spicy indicator (Req 3.1, 3.2)
// ---------------------------------------------------------------------------

describe('buildTierBadge (Req 3.1)', () => {
  it('labels each tier with its human-facing name', () => {
    expect(buildTierBadge('SAFE')).toEqual({ tier: 'SAFE', label: TIER_LABELS.SAFE });
    expect(buildTierBadge('DIRECT')).toEqual({ tier: 'DIRECT', label: 'Reply All' });
    expect(buildTierBadge('VERY_DIRECT').label).toBe('Notice Period Energy');
  });
});

describe('showsSpicyIndicator (Req 3.2)', () => {
  it('is true only for VERY_DIRECT', () => {
    expect(showsSpicyIndicator('VERY_DIRECT')).toBe(true);
    expect(showsSpicyIndicator('DIRECT')).toBe(false);
    expect(showsSpicyIndicator('SAFE')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Variant options and selection (Req 3.3, 3.11)
// ---------------------------------------------------------------------------

describe('listVariantOptions (Req 3.3)', () => {
  it('collects distinct color/size/fit values preserving first-seen order', () => {
    const variants = [
      makeVariant({ color: 'Black', size: 'S', fit: 'Regular' }),
      makeVariant({ color: 'White', size: 'M', fit: 'Oversized' }),
      makeVariant({ color: 'Black', size: 'L', fit: 'Regular' }),
    ];
    const options = listVariantOptions(variants);
    expect(options.color).toEqual(['Black', 'White']);
    expect(options.size).toEqual(['S', 'M', 'L']);
    expect(options.fit).toEqual(['Regular', 'Oversized']);
  });
});

describe('missingSelections / isSelectionComplete (Req 3.11)', () => {
  const variants = [makeVariant({ color: 'Black', size: 'M', fit: 'Regular' })];

  it('reports all dimensions missing for an empty selection', () => {
    expect(missingSelections(variants, {})).toEqual(['color', 'size', 'fit']);
    expect(isSelectionComplete(variants, {})).toBe(false);
  });

  it('reports the remaining dimension when partially selected', () => {
    expect(missingSelections(variants, { color: 'Black', size: 'M' })).toEqual(['fit']);
  });

  it('treats a chosen value not offered as still missing', () => {
    expect(missingSelections(variants, { ...completeSelection, color: 'Pink' })).toEqual([
      'color',
    ]);
  });

  it('is complete when every offered dimension has a valid value', () => {
    expect(isSelectionComplete(variants, completeSelection)).toBe(true);
    expect(requiredDimensions(variants)).toEqual(['color', 'size', 'fit']);
  });
});

describe('resolveVariant', () => {
  it('resolves the matching variant for a complete selection', () => {
    const target = makeVariant({ color: 'White', size: 'L', fit: 'Oversized' });
    const variants = [makeVariant(), target];
    const resolved = resolveVariant(variants, {
      color: 'White',
      size: 'L',
      fit: 'Oversized',
    });
    expect(resolved?.id).toBe(target.id);
  });

  it('returns undefined for an incomplete selection', () => {
    const variants = [makeVariant()];
    expect(resolveVariant(variants, { color: 'Black' })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Purchase-action gating (Req 3.4, 3.11)
// ---------------------------------------------------------------------------

describe('evaluatePurchase (Req 3.4, 3.11)', () => {
  it('enables the action when the complete selection has stock > 0', () => {
    const variants = [makeVariant({ stock: 3, ...completeSelection })];
    const decision = evaluatePurchase(variants, completeSelection);
    expect(decision.enabled).toBe(true);
    expect(decision.reason).toBe('AVAILABLE');
    expect(decision.variant?.stock).toBe(3);
  });

  it('disables the action and marks unavailable when stock is 0 (Req 3.4)', () => {
    const variants = [makeVariant({ stock: 0, ...completeSelection })];
    const decision = evaluatePurchase(variants, completeSelection);
    expect(decision.enabled).toBe(false);
    expect(decision.reason).toBe('OUT_OF_STOCK');
  });

  it('rejects an incomplete selection and prompts for the remaining options (Req 3.11)', () => {
    const variants = [makeVariant({ ...completeSelection })];
    const decision = evaluatePurchase(variants, { color: 'Black' });
    expect(decision.enabled).toBe(false);
    expect(decision.reason).toBe('INCOMPLETE_SELECTION');
    expect(decision.missingOptions).toEqual(['size', 'fit']);
    expect(decision.prompt).toContain('size');
    expect(decision.prompt).toContain('fit');
  });

  it('rejects a complete selection that matches no variant', () => {
    const variants = [makeVariant({ color: 'Black', size: 'M', fit: 'Regular' })];
    const decision = evaluatePurchase(variants, {
      color: 'Black',
      size: 'M',
      fit: 'Oversized',
    });
    // 'Oversized' is not an offered fit, so the selection reads as incomplete.
    expect(decision.enabled).toBe(false);
    expect(decision.reason).toBe('INCOMPLETE_SELECTION');
  });

  it('availability tracks stock exactly (iff stock > 0)', () => {
    expect(isVariantAvailable(makeVariant({ stock: 1 }))).toBe(true);
    expect(isVariantAvailable(makeVariant({ stock: 0 }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Size guide (Req 3.5)
// ---------------------------------------------------------------------------

describe('buildSizeGuide (Req 3.5)', () => {
  it('lists chest and length in cm for each offered size', () => {
    const variants = [
      makeVariant({ size: 'S' }),
      makeVariant({ size: 'M', color: 'White' }),
    ];
    const measurements: SizeMeasurements = {
      S: { chestCm: 96, lengthCm: 68 },
      M: { chestCm: 101, lengthCm: 70 },
    };
    expect(buildSizeGuide(variants, measurements)).toEqual([
      { size: 'S', chestCm: 96, lengthCm: 68 },
      { size: 'M', chestCm: 101, lengthCm: 70 },
    ]);
  });

  it('omits sizes without supplied measurements', () => {
    const variants = [makeVariant({ size: 'S' }), makeVariant({ size: 'XL', color: 'White' })];
    const guide = buildSizeGuide(variants, { S: { chestCm: 96, lengthCm: 68 } });
    expect(guide.map((r) => r.size)).toEqual(['S']);
  });
});

// ---------------------------------------------------------------------------
// Cross-sell (Req 3.7)
// ---------------------------------------------------------------------------

describe('selectCrossSell (Req 3.7)', () => {
  const current = { id: 'prod-1', collectionId: 'col-1' };

  it('excludes the current product and caps at the configured count', () => {
    const pool = [
      makeProduct({ id: 'prod-1' }),
      makeProduct({ id: 'prod-2' }),
      makeProduct({ id: 'prod-3' }),
      makeProduct({ id: 'prod-4' }),
    ];
    const result = selectCrossSell(current, pool, 2);
    expect(result.map((p) => p.id)).toEqual(['prod-2', 'prod-3']);
  });

  it('filters out products from a different collection', () => {
    const pool = [
      makeProduct({ id: 'prod-2', collectionId: 'col-2' }),
      makeProduct({ id: 'prod-3', collectionId: 'col-1' }),
    ];
    expect(selectCrossSell(current, pool, 5).map((p) => p.id)).toEqual(['prod-3']);
  });

  it('returns nothing when the count is zero', () => {
    const pool = [makeProduct({ id: 'prod-2' })];
    expect(selectCrossSell(current, pool, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Trust row (Req 3.10)
// ---------------------------------------------------------------------------

describe('buildTrustRow (Req 3.10)', () => {
  it('states COD availability, returns window, secure Razorpay, and dispatch time', () => {
    const row = buildTrustRow({
      codAvailable: true,
      returnsWindow: '7 days',
      dispatchTime: '2-3 business days',
    });
    expect(row).toEqual({
      codAvailable: true,
      returnsWindow: '7 days',
      secureRazorpayCheckout: true,
      dispatchTime: '2-3 business days',
    });
  });
});

// ---------------------------------------------------------------------------
// Pricing helpers
// ---------------------------------------------------------------------------

describe('pricing helpers', () => {
  it('uses the variant override price when present, else base price', () => {
    const product = makeProduct({ basePrice: 79_900 });
    expect(variantPricePaise(product, makeVariant({ priceOverride: undefined }))).toBe(79_900);
    expect(variantPricePaise(product, makeVariant({ priceOverride: 99_900 }))).toBe(99_900);
  });

  it('formats paise as an INR string', () => {
    expect(formatPriceInr(79_900)).toBe('799.00');
    expect(formatPriceInr(5)).toBe('0.05');
  });

  it('returns undefined for an out-of-range paise value', () => {
    expect(formatPriceInr(-1)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Full view model (Req 3.1–3.7, 3.10, 3.11)
// ---------------------------------------------------------------------------

describe('buildPdpViewModel', () => {
  it('assembles slogan, tier badge, collection tag, and spicy indicator', () => {
    const vm = buildPdpViewModel(
      {
        product: makeProduct(),
        variants: [makeVariant({ ...completeSelection })],
        collection: makeCollection(),
      },
      configWithEnv(),
    );
    expect(vm.slogan).toBe('Notice Period Energy');
    expect(vm.tierBadge.label).toBe('Notice Period Energy');
    expect(vm.collectionTag).toBe('Operator');
    expect(vm.spicyIndicator).toBe(true);
    expect(vm.actions.addToWishlist).toBe(true);
    expect(vm.trustRow.secureRazorpayCheckout).toBe(true);
    expect(vm.trustRow.returnsWindow).toBe('7 days');
  });

  it('disables purchase actions until a complete in-stock selection is made', () => {
    const variants = [makeVariant({ stock: 0, ...completeSelection })];
    const noSelection = buildPdpViewModel(
      { product: makeProduct(), variants, collection: makeCollection() },
      configWithEnv(),
    );
    expect(noSelection.actions.addToCart.enabled).toBe(false);
    expect(noSelection.actions.addToCart.reason).toBe('INCOMPLETE_SELECTION');

    const outOfStock = buildPdpViewModel(
      {
        product: makeProduct(),
        variants,
        collection: makeCollection(),
        selection: completeSelection,
      },
      configWithEnv(),
    );
    expect(outOfStock.actions.buyNow.enabled).toBe(false);
    expect(outOfStock.actions.buyNow.reason).toBe('OUT_OF_STOCK');
  });

  it('honors the Owner_Input cross-sell count', () => {
    const pool = [
      makeProduct({ id: 'prod-2' }),
      makeProduct({ id: 'prod-3' }),
      makeProduct({ id: 'prod-4' }),
    ];
    const vm = buildPdpViewModel(
      {
        product: makeProduct(),
        variants: [makeVariant({ ...completeSelection })],
        collection: makeCollection(),
        sameCollectionProducts: pool,
      },
      configWithEnv({ CROSS_SELL_COUNT: '2' }),
    );
    expect(vm.crossSell.map((c) => c.id)).toEqual(['prod-2', 'prod-3']);
    expect(vm.crossSell[0]?.priceInr).toBe('799.00');
  });
});
