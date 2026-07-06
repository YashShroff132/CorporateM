/**
 * PDP (Product Detail Page) domain logic — variant availability, purchase-action
 * gating, and the presentational view model for a single product.
 *
 * This module contains the pure, testable core of the Product Detail Page
 * (Requirement 3). It intentionally performs no I/O and no rendering: it takes
 * catalog data plus Owner_Input configuration values and produces decisions and
 * a view model that the React page can render directly.
 *
 * Covered acceptance criteria:
 * - 3.1  slogan, tier badge, and collection tag
 * - 3.2  spicy indicator when Tier === VERY_DIRECT
 * - 3.3  color and size (and fit) variant pickers presenting all offered values
 * - 3.4  a complete selection with stock 0 is unavailable; add-to-cart/buy-now disabled
 * - 3.5  size guide with chest and length measurements (cm) per offered size
 * - 3.6  add-to-cart, buy-now, and add-to-wishlist actions
 * - 3.7  up to the Owner_Input cross-sell count from the same Collection, excluding self
 * - 3.10 trust row: COD availability, returns window, secure Razorpay checkout, dispatch time
 * - 3.11 add-to-cart/buy-now before a complete selection is rejected with a prompt for the rest
 *
 * NOT handled here (see task 5.2): Product/Offer/AggregateRating JSON-LD and the
 * Instagram Story share asset.
 */

import { makePaise, toINRString } from '../lib/money';
import type { Config_Service } from './config';
import type { Collection, Id, Product, Tier, Variant } from './catalog';

// ---------------------------------------------------------------------------
// Tier presentation (Req 3.1, 3.2)
// ---------------------------------------------------------------------------

/** A displayable tier badge: the tier value plus its human-facing label. */
export interface TierBadge {
  tier: Tier;
  label: string;
}

/**
 * Human-facing tier labels, sourced from the product glossary:
 * SAFE → "Safe for Standup", DIRECT → "Reply All",
 * VERY_DIRECT → "Notice Period Energy".
 */
export const TIER_LABELS: Readonly<Record<Tier, string>> = {
  SAFE: 'Safe for Standup',
  DIRECT: 'Reply All',
  VERY_DIRECT: 'Notice Period Energy',
};

/** Build the tier badge for a product (Req 3.1). */
export function buildTierBadge(tier: Tier): TierBadge {
  return { tier, label: TIER_LABELS[tier] };
}

/** A VERY_DIRECT product shows a spicy indicator (Req 3.2). */
export function showsSpicyIndicator(tier: Tier): boolean {
  return tier === 'VERY_DIRECT';
}

// ---------------------------------------------------------------------------
// Variant selection and options (Req 3.3)
// ---------------------------------------------------------------------------

/** The variant-defining dimensions a shopper picks on the PDP. */
export const VARIANT_DIMENSIONS = ['color', 'size', 'fit'] as const;
export type VariantDimension = (typeof VARIANT_DIMENSIONS)[number];

/** A (possibly partial) variant selection made by the shopper. */
export type VariantSelection = Partial<Record<VariantDimension, string>>;

/** The distinct values offered for each variant dimension (Req 3.3). */
export interface VariantOptions {
  color: string[];
  size: string[];
  fit: string[];
}

/**
 * Collect the distinct values offered for each variant dimension, preserving
 * first-seen order so the pickers render deterministically (Req 3.3).
 */
export function listVariantOptions(variants: readonly Variant[]): VariantOptions {
  const collect = (dim: VariantDimension): string[] => {
    const seen = new Set<string>();
    const values: string[] = [];
    for (const v of variants) {
      const value = v[dim];
      if (!seen.has(value)) {
        seen.add(value);
        values.push(value);
      }
    }
    return values;
  };
  return { color: collect('color'), size: collect('size'), fit: collect('fit') };
}

/**
 * The dimensions a shopper must choose for this product: a dimension is
 * "offered" (and therefore required) when at least one variant defines it.
 * Variants always carry color/size/fit (Req 1.6), so in practice all three are
 * required; computing dynamically keeps the logic correct for any variant set.
 */
export function requiredDimensions(variants: readonly Variant[]): VariantDimension[] {
  const options = listVariantOptions(variants);
  return VARIANT_DIMENSIONS.filter((dim) => options[dim].length > 0);
}

/**
 * The dimensions still needing a valid selection. A dimension is missing when
 * the shopper has not chosen a value, or chose a value not offered for this
 * product (Req 3.11).
 */
export function missingSelections(
  variants: readonly Variant[],
  selection: VariantSelection,
): VariantDimension[] {
  const options = listVariantOptions(variants);
  return requiredDimensions(variants).filter((dim) => {
    const chosen = selection[dim];
    return chosen === undefined || chosen === '' || !options[dim].includes(chosen);
  });
}

/** True when every required dimension has a valid chosen value (Req 3.11). */
export function isSelectionComplete(
  variants: readonly Variant[],
  selection: VariantSelection,
): boolean {
  return missingSelections(variants, selection).length === 0;
}

/**
 * Resolve the single variant matching a complete selection, or `undefined` when
 * the selection is incomplete or no variant matches the chosen combination.
 */
export function resolveVariant(
  variants: readonly Variant[],
  selection: VariantSelection,
): Variant | undefined {
  if (!isSelectionComplete(variants, selection)) return undefined;
  const dims = requiredDimensions(variants);
  return variants.find((v) => dims.every((dim) => v[dim] === selection[dim]));
}

// ---------------------------------------------------------------------------
// Purchase-action gating (Req 3.4, 3.6, 3.11)
// ---------------------------------------------------------------------------

/** The stock-gated purchase actions on the PDP. */
export type PurchaseAction = 'ADD_TO_CART' | 'BUY_NOW';

/** Why a purchase action is enabled or disabled. */
export type PurchaseReason =
  | 'AVAILABLE'
  | 'INCOMPLETE_SELECTION'
  | 'OUT_OF_STOCK'
  | 'NO_MATCHING_VARIANT';

/** The decision for a purchase action given the current selection. */
export interface PurchaseDecision {
  /** Whether the action may proceed. */
  enabled: boolean;
  reason: PurchaseReason;
  /** The resolved variant when the selection is complete and matches one. */
  variant?: Variant;
  /** Dimensions still to be chosen; populated for INCOMPLETE_SELECTION (Req 3.11). */
  missingOptions: VariantDimension[];
  /** Shopper-facing prompt when the action is rejected. */
  prompt?: string;
}

function formatDimension(dim: VariantDimension): string {
  return dim;
}

function promptForMissing(missing: VariantDimension[]): string {
  const list = missing.map(formatDimension).join(', ');
  return `Please select ${list} before continuing.`;
}

/**
 * Decide whether add-to-cart / buy-now may proceed for the current selection.
 *
 * - An incomplete selection is rejected with a prompt for the remaining
 *   options (Req 3.11).
 * - A complete selection whose variant has stock 0 is unavailable, disabling
 *   the action (Req 3.4).
 * - Add-to-cart and buy-now are enabled iff the selected variant's stock is
 *   greater than zero (Req 3.4).
 */
export function evaluatePurchase(
  variants: readonly Variant[],
  selection: VariantSelection,
): PurchaseDecision {
  const missingOptions = missingSelections(variants, selection);
  if (missingOptions.length > 0) {
    return {
      enabled: false,
      reason: 'INCOMPLETE_SELECTION',
      missingOptions,
      prompt: promptForMissing(missingOptions),
    };
  }

  const variant = resolveVariant(variants, selection);
  if (variant === undefined) {
    return {
      enabled: false,
      reason: 'NO_MATCHING_VARIANT',
      missingOptions: [],
      prompt: 'This combination is not available. Please choose a different one.',
    };
  }

  if (variant.stock <= 0) {
    return { enabled: false, reason: 'OUT_OF_STOCK', variant, missingOptions: [] };
  }

  return { enabled: true, reason: 'AVAILABLE', variant, missingOptions: [] };
}

/**
 * True when a specific fully-specified variant is available to purchase
 * (stock > 0). Convenience for rendering per-combination availability (Req 3.4).
 */
export function isVariantAvailable(variant: Variant): boolean {
  return variant.stock > 0;
}

// ---------------------------------------------------------------------------
// Size guide (Req 3.5)
// ---------------------------------------------------------------------------

/** Chest and length measurements, in centimeters, for one size. */
export interface SizeGuideRow {
  size: string;
  chestCm: number;
  lengthCm: number;
}

/** A lookup of measurements keyed by size label. */
export type SizeMeasurements = Readonly<Record<string, { chestCm: number; lengthCm: number }>>;

/**
 * Build the size guide for the offered sizes, in centimeters (Req 3.5). Sizes
 * without supplied measurements are omitted so the guide never shows blanks.
 */
export function buildSizeGuide(
  variants: readonly Variant[],
  measurements: SizeMeasurements,
): SizeGuideRow[] {
  const { size: sizes } = listVariantOptions(variants);
  const rows: SizeGuideRow[] = [];
  for (const size of sizes) {
    const m = measurements[size];
    if (m !== undefined) {
      rows.push({ size, chestCm: m.chestCm, lengthCm: m.lengthCm });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Cross-sell (Req 3.7)
// ---------------------------------------------------------------------------

/**
 * Select up to `count` cross-sell products from the same Collection, excluding
 * the current product (Req 3.7). `sameCollectionProducts` is expected to be the
 * candidate pool already scoped to the current product's collection; any product
 * with a different collection id or matching the current product id is filtered
 * out defensively.
 */
export function selectCrossSell(
  current: Pick<Product, 'id' | 'collectionId'>,
  sameCollectionProducts: readonly Product[],
  count: number,
): Product[] {
  if (count <= 0) return [];
  return sameCollectionProducts
    .filter((p) => p.id !== current.id && p.collectionId === current.collectionId)
    .slice(0, count);
}

// ---------------------------------------------------------------------------
// Trust row (Req 3.10)
// ---------------------------------------------------------------------------

/**
 * The trust row: COD availability, the Owner_Input returns window, secure
 * Razorpay checkout, and the Owner_Input dispatch time (Req 3.10).
 */
export interface TrustRow {
  codAvailable: boolean;
  returnsWindow: string;
  secureRazorpayCheckout: true;
  dispatchTime: string;
}

/** Build the trust row from Owner_Input configuration values (Req 3.10). */
export function buildTrustRow(input: {
  codAvailable: boolean;
  returnsWindow: string;
  dispatchTime: string;
}): TrustRow {
  return {
    codAvailable: input.codAvailable,
    returnsWindow: input.returnsWindow,
    secureRazorpayCheckout: true,
    dispatchTime: input.dispatchTime,
  };
}

// ---------------------------------------------------------------------------
// Pricing display helpers
// ---------------------------------------------------------------------------

/** The price in paise for a variant, honoring its optional override. */
export function variantPricePaise(product: Product, variant: Variant): number {
  return variant.priceOverride ?? product.basePrice;
}

/**
 * Format a paise amount as an INR display string (e.g. 79900 → "799.00").
 * Returns `undefined` for values outside the valid money range rather than
 * throwing, so a bad stored value never breaks rendering.
 */
export function formatPriceInr(paise: number): string | undefined {
  const validated = makePaise(paise);
  return validated.ok ? toINRString(validated.value) : undefined;
}

// ---------------------------------------------------------------------------
// View model assembly (Req 3.1–3.7, 3.10, 3.11)
// ---------------------------------------------------------------------------

/** Everything the PDP needs to render the purchase actions (Req 3.6). */
export interface PdpActions {
  /** add-to-cart enabled state for the current selection (Req 3.4, 3.11). */
  addToCart: PurchaseDecision;
  /** buy-now enabled state for the current selection (Req 3.4, 3.11). */
  buyNow: PurchaseDecision;
  /** add-to-wishlist is a product-level action, always offered (Req 3.6). */
  addToWishlist: boolean;
}

/** A cross-sell card for rendering (Req 3.7). */
export interface CrossSellItem {
  id: Id;
  slug: string;
  slogan: string;
  tier: Tier;
  priceInr?: string;
}

/** The complete presentational view model for a product detail page. */
export interface PdpViewModel {
  productId: Id;
  slug: string;
  slogan: string;
  tierBadge: TierBadge;
  collectionTag: string;
  spicyIndicator: boolean;
  options: VariantOptions;
  selectedVariant?: Variant;
  priceInr?: string;
  sizeGuide: SizeGuideRow[];
  actions: PdpActions;
  crossSell: CrossSellItem[];
  trustRow: TrustRow;
}

/** Input to {@link buildPdpViewModel}. */
export interface PdpViewModelInput {
  product: Product;
  variants: readonly Variant[];
  collection: Collection;
  /** Current shopper selection; defaults to empty (nothing chosen yet). */
  selection?: VariantSelection;
  /** Measurements keyed by size label for the size guide (Req 3.5). */
  sizeMeasurements?: SizeMeasurements;
  /** Candidate products from the same Collection for cross-sell (Req 3.7). */
  sameCollectionProducts?: readonly Product[];
  /** Whether COD is offered, shown in the trust row (Req 3.10). */
  codAvailable?: boolean;
}

/**
 * Assemble the full PDP view model from catalog data and Owner_Input
 * configuration. Pure and deterministic given its inputs.
 */
export function buildPdpViewModel(
  input: PdpViewModelInput,
  config: Config_Service,
): PdpViewModel {
  const { product, variants, collection } = input;
  const selection = input.selection ?? {};

  const options = listVariantOptions(variants);
  const selectedVariant = resolveVariant(variants, selection);

  const priceInr =
    selectedVariant !== undefined
      ? formatPriceInr(variantPricePaise(product, selectedVariant))
      : formatPriceInr(product.basePrice);

  const crossSellProducts = selectCrossSell(
    product,
    input.sameCollectionProducts ?? [],
    config.crossSellCount(),
  );

  const crossSell: CrossSellItem[] = crossSellProducts.map((p) => ({
    id: p.id,
    slug: p.slug,
    slogan: p.slogan,
    tier: p.tier,
    priceInr: formatPriceInr(p.basePrice),
  }));

  return {
    productId: product.id,
    slug: product.slug,
    slogan: product.slogan,
    tierBadge: buildTierBadge(product.tier),
    collectionTag: collection.title,
    spicyIndicator: showsSpicyIndicator(product.tier),
    options,
    selectedVariant,
    priceInr,
    sizeGuide: buildSizeGuide(variants, input.sizeMeasurements ?? {}),
    actions: {
      addToCart: evaluatePurchase(variants, selection),
      buyNow: evaluatePurchase(variants, selection),
      addToWishlist: true,
    },
    crossSell,
    trustRow: buildTrustRow({
      codAvailable: input.codAvailable ?? true,
      returnsWindow: config.returnsWindow(),
      dispatchTime: config.dispatchTime(),
    }),
  };
}
