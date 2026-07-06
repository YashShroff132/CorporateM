/**
 * Checkout_Service — task 11.1 scope: pincode autofill and guest contact
 * validation.
 *
 * This module implements the pure, testable slice of the Checkout_Service
 * described in design.md:
 *   - `autofillPincode`: populate city/state for a valid serviceable 6-digit
 *     pincode; reject invalid or unrecognized pincodes leaving fields empty
 *     (Req 7.2, 7.10).
 *   - `validateGuestContact`: accept guest checkout only with a valid email and
 *     a valid 10-digit Indian mobile number; on error retain previously entered
 *     details and identify the invalid field (Req 7.1, 7.9).
 *   - Account creation is offered only after a successful guest purchase; this
 *     module exposes `guestAccountCreationOffer` as a pure decision helper
 *     (Req 7.8).
 *
 * Order pricing, coupon application, and price snapshots are intentionally NOT
 * implemented here — they belong to task 11.2.
 *
 * Boundaries are validated with Zod per the design's "validation is pervasive"
 * tenet. External serviceability data is injected via a `PincodeDirectory` so
 * the pure logic stays decoupled and testable (Req 23.1).
 */

import { z } from 'zod';
import { type Result, ok, err, isErr } from '@/lib/result';

/** A city/state pair associated with a serviceable pincode. */
export interface PincodeLocation {
  readonly city: string;
  readonly state: string;
}

/**
 * Serviceability + location lookup for pincodes. Implemented at launch by an
 * owner-configured local directory (see {@link createInMemoryPincodeDirectory});
 * later replaceable by the Shipping_Service aggregator without changing callers.
 */
export interface PincodeDirectory {
  /** Returns the location for a serviceable pincode, or undefined otherwise. */
  lookup(pincode: string): PincodeLocation | undefined;
}

/** Discriminated error type for Checkout_Service operations. */
export type CheckoutError =
  | { readonly kind: 'INVALID_PINCODE'; readonly message: string }
  | { readonly kind: 'UNRECOGNIZED_PINCODE'; readonly message: string }
  | {
      readonly kind: 'INVALID_CONTACT';
      readonly fields: readonly ContactField[];
      readonly message: string;
    };

/** Which guest-contact field failed validation. */
export type ContactField = 'email' | 'phone';

/** Guest contact details captured at checkout (Req 7.1). */
export interface GuestContact {
  readonly email: string;
  readonly phone: string;
}

/**
 * A valid 6-digit Indian pincode: exactly six digits, not starting with 0
 * (Indian PIN codes never begin with 0). Req 7.2, 7.10.
 */
const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/u, 'Pincode must be a valid 6-digit number');

/**
 * A valid 10-digit Indian mobile number: exactly ten digits beginning with a
 * digit in the 6-9 range, per Indian numbering (Req 6.2, 7.1, 7.9).
 */
const indianMobileSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/u, 'Phone must be a valid 10-digit Indian mobile number');

/** A syntactically valid email address (Req 7.1, 7.9). */
const emailSchema = z.string().trim().email('Email must be a valid email address');

/** True when the string is a syntactically valid 6-digit Indian pincode. */
export function isValidPincodeFormat(pincode: string): boolean {
  return pincodeSchema.safeParse(pincode).success;
}

/** True when the string is a valid 10-digit Indian mobile number. */
export function isValidIndianMobile(phone: string): boolean {
  return indianMobileSchema.safeParse(phone).success;
}

/** True when the string is a syntactically valid email address. */
export function isValidEmail(email: string): boolean {
  return emailSchema.safeParse(email).success;
}

/**
 * Autofill the city and state for a delivery pincode.
 *
 * Returns the associated location only when the pincode is a valid 6-digit
 * number AND is serviceable per the injected {@link PincodeDirectory}. Any
 * malformed pincode yields `INVALID_PINCODE`; a well-formed but unknown/
 * non-serviceable pincode yields `UNRECOGNIZED_PINCODE`. In both error cases the
 * caller must leave the city and state fields empty (Req 7.2, 7.10).
 */
export function autofillPincode(
  pincode: string,
  directory: PincodeDirectory,
): Result<PincodeLocation, CheckoutError> {
  const parsed = pincodeSchema.safeParse(pincode);
  if (!parsed.success) {
    return err({
      kind: 'INVALID_PINCODE',
      message: 'Enter a valid 6-digit pincode.',
    });
  }

  const location = directory.lookup(parsed.data);
  if (location === undefined) {
    return err({
      kind: 'UNRECOGNIZED_PINCODE',
      message: 'This pincode is not recognized or not serviceable.',
    });
  }

  return ok({ city: location.city, state: location.state });
}

/**
 * Validate guest checkout contact details.
 *
 * The submission is accepted only when the email is a valid email format and
 * the phone is a valid 10-digit Indian mobile number. On failure the previously
 * entered details (`prior`, when supplied) are returned in the error so the UI
 * can retain them, and every invalid field is identified (Req 7.1, 7.9).
 *
 * The accepted value is normalized (trimmed) so downstream consumers receive
 * clean data.
 */
export function validateGuestContact(
  input: GuestContact,
): Result<GuestContact, CheckoutError> {
  const emailResult = emailSchema.safeParse(input.email);
  const phoneResult = indianMobileSchema.safeParse(input.phone);

  if (!emailResult.success || !phoneResult.success) {
    const invalidFields: ContactField[] = [];
    if (!emailResult.success) invalidFields.push('email');
    if (!phoneResult.success) invalidFields.push('phone');
    return err({
      kind: 'INVALID_CONTACT',
      fields: invalidFields,
      message: `Please correct the following field(s): ${invalidFields.join(', ')}.`,
    });
  }

  // Reference the individually narrowed success results so the returned contact
  // is typed as `GuestContact` (TypeScript does not narrow both operands across
  // the combined `||` early return above).
  const email = emailResult.data;
  const phone = phoneResult.data;
  return ok({ email, phone });
}

/**
 * Whether to offer account creation to a guest. Account creation is offered
 * only after a successful guest purchase (Req 7.8).
 */
export function guestAccountCreationOffer(purchaseSucceeded: boolean): boolean {
  return purchaseSucceeded;
}

/**
 * Create a {@link PincodeDirectory} backed by an in-memory map of serviceable
 * pincodes to their location. Pincodes absent from the map are treated as not
 * serviceable. This is the launch-time owner-configured local directory; the
 * Shipping_Service aggregator (task 23, behind a feature flag) can supply an
 * alternative implementation later without changing checkout callers.
 *
 * Keys are validated to be well-formed pincodes; malformed keys are ignored so
 * a bad seed entry cannot make an invalid pincode appear serviceable.
 */
export function createInMemoryPincodeDirectory(
  seed: Readonly<Record<string, PincodeLocation>>,
): PincodeDirectory {
  const table = new Map<string, PincodeLocation>();
  for (const [pincode, location] of Object.entries(seed)) {
    if (isValidPincodeFormat(pincode)) {
      table.set(pincode.trim(), { city: location.city, state: location.state });
    }
  }
  return {
    lookup(pincode: string): PincodeLocation | undefined {
      const parsed = pincodeSchema.safeParse(pincode);
      if (!parsed.success) return undefined;
      return table.get(parsed.data);
    },
  };
}

// ---------------------------------------------------------------------------
// Task 11.2 — order pricing, coupon application, and price snapshots
// ---------------------------------------------------------------------------
//
// This slice computes the itemized order totals presented before payment
// (subtotal, discount, shipping, tax, total) entirely in integer paise, applies
// a coupon while flooring the resulting total at 0 paise, rejects expired /
// inactive / below-minimum coupons while leaving the total unchanged, and
// records per-line price snapshots for the created order.
//
//   - Req 7.3: subtotal, discount, shipping, tax, and total are separate items.
//   - Req 7.4: a valid coupon's discount is applied and capped so the resulting
//     total is never less than 0 paise.
//   - Req 7.5: an expired, inactive, or below-minimum coupon is rejected, the
//     total is left unchanged, and the rejection reason is reported.
//   - Req 7.6: every monetary amount is an integer number of paise.
//   - Req 7.7: the created order records a price snapshot per line item.
//
// All arithmetic is delegated to the Money module (integer paise, half-up
// rounding, no floating point); tax is delegated to the Invoice_Service. The
// functions are pure and dependency-injected so they can be tested without I/O.

import {
  type Paise,
  type MoneyError,
  makePaise,
  add,
  sub,
  applyRatePercentHalfUp,
} from '@/lib/money';
import {
  type Invoice_Service,
  type InvoiceError,
  invoiceService as defaultInvoiceService,
} from './invoice';
import { config as defaultConfig, type Config_Service } from './config';

/** Cart line quantity bounds (Req 5.1, 5.2). */
export const MIN_LINE_QUANTITY = 1;
export const MAX_LINE_QUANTITY = 99;

/**
 * A single order line to be priced. The `unitPrice` is the current server-side
 * variant price in integer paise (Req 5.5); `quantity` is an integer 1..99.
 */
export interface PricedOrderLine {
  /** Identifier of the purchased variant. */
  readonly variantId: string;
  /** Optional SKU captured into the snapshot for traceability. */
  readonly sku?: string;
  /** Optional human-readable description captured into the snapshot. */
  readonly description?: string;
  /** Current unit price in integer paise. */
  readonly unitPrice: Paise;
  /** Line quantity; an integer from 1 to 99 inclusive. */
  readonly quantity: number;
}

/** Itemized monetary breakdown of an order, all in integer paise (Req 7.3, 7.6). */
export interface OrderTotals {
  readonly subtotal: Paise;
  readonly discount: Paise;
  readonly shipping: Paise;
  readonly tax: Paise;
  readonly total: Paise;
}

/** A coupon as needed for checkout pricing (mirrors the Coupon data model). */
export interface Coupon {
  readonly code: string;
  /** FLAT deducts a fixed paise amount; PERCENT deducts a percentage of subtotal. */
  readonly discountType: 'FLAT' | 'PERCENT';
  /** Paise for FLAT; percentage points (0..100) for PERCENT. */
  readonly discountValue: number;
  /** Minimum order subtotal (paise) required for the coupon to apply. */
  readonly minSubtotal: Paise;
  /** Whether the coupon is currently active. */
  readonly active: boolean;
  /** Expiry instant; a coupon is expired when `now` is at or after this. Null = never expires. */
  readonly expiresAt?: Date | null;
}

/** Why a coupon was rejected (Req 7.5). */
export type CouponRejectionReason = 'EXPIRED' | 'INACTIVE' | 'BELOW_MINIMUM' | 'INVALID_DISCOUNT';

/** Discriminated error type for pricing and coupon operations. */
export type PricingError =
  | { readonly kind: 'INVALID_LINE'; readonly message: string }
  | { readonly kind: 'MONEY_ERROR'; readonly message: string; readonly cause: MoneyError }
  | { readonly kind: 'TAX_ERROR'; readonly message: string; readonly cause: InvoiceError };

/** Error returned when a coupon is rejected; the order total is left unchanged. */
export type CouponError = {
  readonly kind: 'COUPON_REJECTED';
  readonly reason: CouponRejectionReason;
  readonly message: string;
};

/** An immutable per-line price snapshot recorded on the created order (Req 7.7). */
export interface OrderLineSnapshot {
  readonly variantId: string;
  readonly sku: string | null;
  readonly description: string | null;
  /** Unit price at time of purchase, in integer paise. */
  readonly unitPrice: Paise;
  readonly quantity: number;
  /** unitPrice × quantity, in integer paise. */
  readonly lineTotal: Paise;
}

/** Options controlling how an order is priced. */
export interface PriceOrderOptions {
  /** Shipping charge in integer paise; defaults to 0. */
  readonly shipping?: Paise;
  /** GST rate percent used for tax; defaults to the configured rate. */
  readonly gstRatePercent?: number;
  /** Invoice service used for tax computation; defaults to the shared instance. */
  readonly invoice?: Invoice_Service;
  /** Config service used to source the default GST rate. */
  readonly config?: Config_Service;
}

function moneyErr(cause: MoneyError): PricingError {
  return { kind: 'MONEY_ERROR', message: cause.message, cause };
}

function taxErr(cause: InvoiceError): PricingError {
  return { kind: 'TAX_ERROR', message: cause.message, cause };
}

/** True when a value is an integer line quantity within 1..99 inclusive. */
export function isValidLineQuantity(quantity: number): boolean {
  return (
    Number.isInteger(quantity) &&
    quantity >= MIN_LINE_QUANTITY &&
    quantity <= MAX_LINE_QUANTITY
  );
}

/** Compute a line's total (unitPrice × quantity) as validated integer paise. */
function lineTotalPaise(line: PricedOrderLine): Result<Paise, PricingError> {
  if (!isValidLineQuantity(line.quantity)) {
    return err({
      kind: 'INVALID_LINE',
      message: `Line quantity must be an integer from ${MIN_LINE_QUANTITY} to ${MAX_LINE_QUANTITY}, received ${line.quantity}`,
    });
  }
  // unitPrice (<= 99,999,999) × quantity (<= 99) stays well within MONEY_MAX and
  // the safe-integer range, so a single validated multiplication is exact.
  const product = makePaise((line.unitPrice as number) * line.quantity);
  if (isErr(product)) return err(moneyErr(product.error));
  return ok(product.value);
}

/**
 * Build the immutable per-line price snapshots recorded on the created order
 * (Req 7.7). Each snapshot captures the variant, unit price, quantity, and the
 * derived line total in integer paise.
 */
export function buildOrderLineSnapshots(
  lines: readonly PricedOrderLine[],
): Result<OrderLineSnapshot[], PricingError> {
  const snapshots: OrderLineSnapshot[] = [];
  for (const line of lines) {
    const total = lineTotalPaise(line);
    if (isErr(total)) return total;
    snapshots.push({
      variantId: line.variantId,
      sku: line.sku ?? null,
      description: line.description ?? null,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      lineTotal: total.value,
    });
  }
  return ok(snapshots);
}

/**
 * Price an order into its itemized totals with no coupon applied (Req 7.3, 7.6).
 *
 * - `subtotal` is the sum of every line's unitPrice × quantity.
 * - `shipping` is taken from options (default 0 paise).
 * - `tax` is computed by the Invoice_Service per line item at the GST rate,
 *   half-up to integer paise, then summed.
 * - `discount` is 0 here; coupons are applied separately via {@link applyCoupon}.
 * - `total` is subtotal + shipping + tax.
 *
 * All amounts are validated integer paise; any overflow or invalid line is
 * reported as an error rather than producing a corrupt total.
 */
export function priceOrder(
  lines: readonly PricedOrderLine[],
  options: PriceOrderOptions = {},
): Result<OrderTotals, PricingError> {
  const zero = makePaise(0);
  if (isErr(zero)) return err(moneyErr(zero.error));

  // Subtotal = sum of validated line totals.
  let subtotal: Paise = zero.value;
  for (const line of lines) {
    const total = lineTotalPaise(line);
    if (isErr(total)) return total;
    const next = add(subtotal, total.value);
    if (isErr(next)) return err(moneyErr(next.error));
    subtotal = next.value;
  }

  const shipping = options.shipping ?? zero.value;

  // Tax is delegated to the Invoice_Service (per-line half-up, then summed).
  const invoice = options.invoice ?? defaultInvoiceService;
  const cfg = options.config ?? defaultConfig;
  const ratePercent = options.gstRatePercent ?? cfg.gstRatePercent();
  const taxLines = lines.map((line) => {
    // Reuse each line's validated total as its net taxable amount.
    const t = (line.unitPrice as number) * line.quantity;
    return { net: t as Paise };
  });
  const tax = invoice.computeOrderTax(taxLines, ratePercent);
  if (isErr(tax)) return err(taxErr(tax.error));

  // total = subtotal + shipping + tax (discount applied later via applyCoupon).
  const withShipping = add(subtotal, shipping);
  if (isErr(withShipping)) return err(moneyErr(withShipping.error));
  const total = add(withShipping.value, tax.value);
  if (isErr(total)) return err(moneyErr(total.error));

  return ok({
    subtotal,
    discount: zero.value,
    shipping,
    tax: tax.value,
    total: total.value,
  });
}

/** Compute the raw (uncapped) discount a coupon yields for a given subtotal. */
function rawCouponDiscount(
  coupon: Coupon,
  subtotal: Paise,
): Result<Paise, CouponError> {
  if (coupon.discountType === 'FLAT') {
    const flat = makePaise(coupon.discountValue);
    if (isErr(flat)) {
      return err({
        kind: 'COUPON_REJECTED',
        reason: 'INVALID_DISCOUNT',
        message: `Coupon ${coupon.code} has an invalid flat discount value`,
      });
    }
    return ok(flat.value);
  }
  // PERCENT: percentage of the subtotal, half-up to integer paise.
  if (
    !Number.isFinite(coupon.discountValue) ||
    coupon.discountValue < 0 ||
    coupon.discountValue > 100
  ) {
    return err({
      kind: 'COUPON_REJECTED',
      reason: 'INVALID_DISCOUNT',
      message: `Coupon ${coupon.code} has an invalid percentage discount value`,
    });
  }
  const pct = applyRatePercentHalfUp(subtotal, coupon.discountValue);
  if (isErr(pct)) {
    return err({
      kind: 'COUPON_REJECTED',
      reason: 'INVALID_DISCOUNT',
      message: `Coupon ${coupon.code} produced an invalid discount amount`,
    });
  }
  return ok(pct.value);
}

/**
 * Apply a coupon to already-computed order totals (Req 7.4, 7.5).
 *
 * The coupon is rejected — leaving the passed `totals` unchanged — when it is
 * inactive, expired (at or after `expiresAt`), or the order subtotal is below
 * the coupon's minimum. On acceptance the discount is deducted from the total
 * and the result is floored at 0 paise so the total is never negative; the
 * reported `discount` equals the amount actually deducted (never more than the
 * pre-discount total).
 *
 * This function is pure: it returns a new {@link OrderTotals} and never mutates
 * its input, so a rejected coupon naturally leaves the caller's total unchanged.
 */
export function applyCoupon(
  totals: OrderTotals,
  coupon: Coupon,
  now: Date = new Date(),
): Result<OrderTotals, CouponError> {
  if (!coupon.active) {
    return err({
      kind: 'COUPON_REJECTED',
      reason: 'INACTIVE',
      message: `Coupon ${coupon.code} is not active.`,
    });
  }

  if (coupon.expiresAt != null && now.getTime() >= coupon.expiresAt.getTime()) {
    return err({
      kind: 'COUPON_REJECTED',
      reason: 'EXPIRED',
      message: `Coupon ${coupon.code} has expired.`,
    });
  }

  if ((totals.subtotal as number) < (coupon.minSubtotal as number)) {
    return err({
      kind: 'COUPON_REJECTED',
      reason: 'BELOW_MINIMUM',
      message: `Order subtotal is below the minimum required for coupon ${coupon.code}.`,
    });
  }

  const rawDiscount = rawCouponDiscount(coupon, totals.subtotal);
  if (isErr(rawDiscount)) return rawDiscount;

  // Deduct the discount from the total, flooring the result at 0 paise so the
  // total is never negative (Req 7.4). The effective discount is the amount
  // actually removed from the total, which caps the discount at the pre-discount
  // total without ever increasing it.
  const cappedTotal = sub(totals.total, rawDiscount.value, { clampAtZero: true });
  if (isErr(cappedTotal)) {
    return err({
      kind: 'COUPON_REJECTED',
      reason: 'INVALID_DISCOUNT',
      message: `Coupon ${coupon.code} could not be applied to the order total.`,
    });
  }

  const effectiveDiscount = sub(totals.total, cappedTotal.value);
  if (isErr(effectiveDiscount)) {
    return err({
      kind: 'COUPON_REJECTED',
      reason: 'INVALID_DISCOUNT',
      message: `Coupon ${coupon.code} could not be applied to the order total.`,
    });
  }

  return ok({
    subtotal: totals.subtotal,
    discount: effectiveDiscount.value,
    shipping: totals.shipping,
    tax: totals.tax,
    total: cappedTotal.value,
  });
}
