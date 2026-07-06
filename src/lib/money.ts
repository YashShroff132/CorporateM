/**
 * Money module — the single source of truth for monetary correctness.
 *
 * All monetary values in Corporate Cult are integer paise in INR
 * (1 INR = 100 paise). This module enforces:
 *   - integer-only amounts (no fractional paise are ever stored)
 *   - range 0..9,999,999,999 paise inclusive
 *   - half-up rounding for any non-integer intermediate result
 *   - no floating-point participation in arithmetic
 *
 * Every operation that can produce an out-of-range or non-integer amount
 * returns a `Result` rather than throwing, so callers must handle the error
 * case explicitly and the prior value is never silently corrupted.
 *
 * Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6
 */

import { type Result, ok, err } from './result';

/**
 * Branded integer-paise amount. The brand prevents raw `number` values from
 * being used where a validated `Paise` is required; construct one via
 * {@link makePaise}, {@link add}, {@link sub}, or {@link applyRatePercentHalfUp}.
 */
export type Paise = number & { readonly __brand: 'Paise' };

/** Minimum storable monetary value in paise (inclusive). */
export const MONEY_MIN = 0;

/** Maximum storable monetary value in paise (inclusive). */
export const MONEY_MAX = 9_999_999_999;

/** Discriminated error type describing why a monetary operation failed. */
export type MoneyError =
  | { readonly kind: 'NOT_INTEGER'; readonly message: string }
  | { readonly kind: 'OUT_OF_RANGE'; readonly message: string }
  | { readonly kind: 'INVALID_RATE'; readonly message: string };

/**
 * Validate and brand a raw number as `Paise`.
 *
 * Accepts only finite integers within 0..MONEY_MAX. Any non-integer or
 * out-of-range value is rejected with a `MoneyError` (Req 26.1, 26.6).
 */
export function makePaise(n: number): Result<Paise, MoneyError> {
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return err({
      kind: 'NOT_INTEGER',
      message: `Monetary value must be an integer number of paise, received ${n}`,
    });
  }
  if (n < MONEY_MIN || n > MONEY_MAX) {
    return err({
      kind: 'OUT_OF_RANGE',
      message: `Monetary value ${n} is outside the range ${MONEY_MIN}..${MONEY_MAX} paise`,
    });
  }
  return ok(n as Paise);
}

/**
 * Add two paise amounts. The sum is validated so an overflow past MONEY_MAX
 * is reported as an error rather than stored (Req 26.1, 26.2).
 */
export function add(a: Paise, b: Paise): Result<Paise, MoneyError> {
  return makePaise((a as number) + (b as number));
}

/**
 * Subtract `b` from `a`.
 *
 * By default a negative result is rejected as out of range. When the caller
 * opts into clamping (e.g. coupon discounts that floor an order total at 0),
 * a negative result is clamped to 0 paise instead (Req 26.1, 7.4).
 */
export function sub(
  a: Paise,
  b: Paise,
  opts?: { readonly clampAtZero?: boolean },
): Result<Paise, MoneyError> {
  const diff = (a as number) - (b as number);
  if (diff < MONEY_MIN && opts?.clampAtZero) {
    return makePaise(MONEY_MIN);
  }
  return makePaise(diff);
}

/**
 * Apply a percentage rate to a base amount, rounding the result half-up to the
 * nearest paise using integer arithmetic only (Req 26.2, 26.3).
 *
 * The rate is converted to integer basis points (rate * 100) so typical GST
 * rates (0, 5, 12, 18, 28, and up to two decimal places) are represented
 * exactly. The half-up rounding uses the identity
 *   round(v / d) = floor((2v + d) / (2d))
 * which rounds ties (.5) upward.
 *
 * Returns a `Result` because an invalid rate or an out-of-range product is a
 * recoverable error rather than a thrown exception.
 */
export function applyRatePercentHalfUp(
  base: Paise,
  ratePercent: number,
): Result<Paise, MoneyError> {
  if (!Number.isFinite(ratePercent) || ratePercent < 0) {
    return err({
      kind: 'INVALID_RATE',
      message: `Rate percent must be a finite non-negative number, received ${ratePercent}`,
    });
  }

  // Convert to integer basis points (1% = 100 bps) to keep arithmetic integral.
  const basisPoints = Math.round(ratePercent * 100);
  const numerator = (base as number) * basisPoints; // paise * bps
  const denominator = 10_000; // 100 (percent) * 100 (bps per percent)

  // Half-up rounding of numerator / denominator using integers only.
  const rounded = Math.floor((numerator * 2 + denominator) / (denominator * 2));

  return makePaise(rounded);
}

/**
 * Render a stored paise value as an INR string with exactly two decimal
 * places, without altering the stored value (Req 26.5, 9.7).
 *
 * Uses integer division so no floating-point rounding is involved:
 * 12345 paise -> "123.45", 5 -> "0.05", 100 -> "1.00".
 */
export function toINRString(p: Paise): string {
  const paise = p as number;
  const rupees = Math.floor(paise / 100);
  const fraction = paise % 100;
  const fractionStr = fraction < 10 ? `0${fraction}` : `${fraction}`;
  return `${rupees}.${fractionStr}`;
}
