import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  makePaise,
  add,
  sub,
  applyRatePercentHalfUp,
  toINRString,
  MONEY_MIN,
  MONEY_MAX,
  type Paise,
} from './money';
import { isOk, isErr } from './result';

/**
 * Custom arbitrary for the Money module.
 *
 * `paiseArb` spans three disjoint regions so both the acceptance and the
 * rejection paths of {@link makePaise} are exercised (design.md "Custom
 * generators"):
 *   - in-range integers: 0..MONEY_MAX (accepted)
 *   - out-of-range integers: negative and > MONEY_MAX (rejected OUT_OF_RANGE)
 *   - non-integers: finite fractional values (rejected NOT_INTEGER)
 */
const inRangePaiseArb = fc.integer({ min: MONEY_MIN, max: MONEY_MAX });

const outOfRangePaiseArb = fc.oneof(
  fc.integer({ min: -1_000_000_000, max: -1 }),
  fc.integer({ min: MONEY_MAX + 1, max: MONEY_MAX + 1_000_000_000 }),
);

const nonIntegerPaiseArb = fc
  .double({ min: -1_000_000, max: 1_000_000, noNaN: true, noDefaultInfinity: true })
  .filter((n) => !Number.isInteger(n));

const paiseArb = fc.oneof(inRangePaiseArb, outOfRangePaiseArb, nonIntegerPaiseArb);

/** Independent half-up rounding of numerator/denominator using integers only. */
function halfUp(numerator: number, denominator: number): number {
  const q = Math.floor(numerator / denominator);
  const r = numerator - q * denominator;
  return r * 2 >= denominator ? q + 1 : q;
}

describe('Money module — Property 1: Integer-paise closure and half-up rounding', () => {
  // Feature: corporate-cult-ecommerce, Property 1: Integer-paise closure and half-up rounding —
  // For any sequence of monetary values and arithmetic operations, every stored/computed result is
  // an integer number of paise within 0..9,999,999,999; any non-integer intermediate is rounded to
  // the nearest paise with halves rounding up; and any attempt to store a non-integer or
  // out-of-range value is rejected while the prior value is retained.
  // Validates: Requirements 26.1, 26.2, 26.3, 26.6, 7.6, 1.9
  it('validates, rounds half-up, and rejects invalid values while preserving prior state', () => {
    fc.assert(
      fc.property(
        paiseArb,
        paiseArb,
        fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (a, b, ratePercent) => {
          // --- makePaise: closure and rejection ---
          const ra = makePaise(a);
          const validA = Number.isInteger(a) && a >= MONEY_MIN && a <= MONEY_MAX;
          expect(isOk(ra)).toBe(validA);
          if (isOk(ra)) {
            const v = ra.value as number;
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(MONEY_MIN);
            expect(v).toBeLessThanOrEqual(MONEY_MAX);
            expect(v).toBe(a);
          } else {
            // Rejected values carry a discriminated error; nothing is stored.
            expect(['NOT_INTEGER', 'OUT_OF_RANGE']).toContain(ra.error.kind);
            if (!Number.isInteger(a)) {
              expect(ra.error.kind).toBe('NOT_INTEGER');
            } else {
              expect(ra.error.kind).toBe('OUT_OF_RANGE');
            }
          }

          // Only continue arithmetic checks with two valid operands.
          const rb = makePaise(b);
          if (!isOk(ra) || !isOk(rb)) {
            return;
          }
          const pa = ra.value;
          const pb = rb.value;

          // --- add: closure with overflow rejected ---
          const sum = (pa as number) + (pb as number);
          const radd = add(pa, pb);
          if (sum <= MONEY_MAX) {
            expect(isOk(radd)).toBe(true);
            if (isOk(radd)) {
              expect(radd.value as number).toBe(sum);
              expect(Number.isInteger(radd.value as number)).toBe(true);
            }
          } else {
            expect(isErr(radd)).toBe(true);
            if (isErr(radd)) expect(radd.error.kind).toBe('OUT_OF_RANGE');
          }

          // --- sub: negative rejected by default, clamped when opted in ---
          const diff = (pa as number) - (pb as number);
          const rsub = sub(pa, pb);
          if (diff >= MONEY_MIN) {
            expect(isOk(rsub)).toBe(true);
            if (isOk(rsub)) expect(rsub.value as number).toBe(diff);
          } else {
            expect(isErr(rsub)).toBe(true);
            const clamped = sub(pa, pb, { clampAtZero: true });
            expect(isOk(clamped)).toBe(true);
            if (isOk(clamped)) expect(clamped.value as number).toBe(MONEY_MIN);
          }

          // --- applyRatePercentHalfUp: integer result, half-up rounding ---
          const rrate = applyRatePercentHalfUp(pa, ratePercent);
          const basisPoints = Math.round(ratePercent * 100);
          const expected = halfUp((pa as number) * basisPoints, 10_000);
          if (expected <= MONEY_MAX) {
            expect(isOk(rrate)).toBe(true);
            if (isOk(rrate)) {
              const rv = rrate.value as number;
              expect(Number.isInteger(rv)).toBe(true);
              expect(rv).toBe(expected);
              expect(rv).toBeGreaterThanOrEqual(MONEY_MIN);
              expect(rv).toBeLessThanOrEqual(MONEY_MAX);
            }
          } else {
            expect(isErr(rrate)).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('rounds a .5 paise tie upward (half-up)', () => {
    // 1 paise at 50% = 0.5 paise -> rounds up to 1
    const base = makePaise(1);
    expect(isOk(base)).toBe(true);
    if (isOk(base)) {
      const r = applyRatePercentHalfUp(base.value, 50);
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value as number).toBe(1);
    }
  });

  it('rejects non-integer and out-of-range inputs to makePaise', () => {
    expect(isErr(makePaise(1.5))).toBe(true);
    expect(isErr(makePaise(-1))).toBe(true);
    expect(isErr(makePaise(MONEY_MAX + 1))).toBe(true);
    expect(isErr(makePaise(Number.NaN))).toBe(true);
    expect(isOk(makePaise(0))).toBe(true);
    expect(isOk(makePaise(MONEY_MAX))).toBe(true);
  });
});

describe('Money module — Property 2: INR display derivation', () => {
  // Feature: corporate-cult-ecommerce, Property 2: INR display derivation —
  // For any stored paise value, the displayed string equals the value divided by 100 formatted with
  // exactly two decimal places, and the stored value is unchanged by display.
  // Validates: Requirements 26.5, 9.7
  it('derives a two-decimal INR string without mutating the stored value', () => {
    fc.assert(
      fc.property(inRangePaiseArb, (n) => {
        const r = makePaise(n);
        expect(isOk(r)).toBe(true);
        if (!isOk(r)) return;
        const p: Paise = r.value;
        const before = p as number;

        const s = toINRString(p);

        // Exactly two decimal places, matching value / 100.
        expect(s).toMatch(/^\d+\.\d{2}$/);
        const rupees = Math.floor(before / 100);
        const fraction = before % 100;
        const expected = `${rupees}.${fraction < 10 ? `0${fraction}` : `${fraction}`}`;
        expect(s).toBe(expected);

        // Parsing back at paise granularity recovers the exact stored value.
        expect(Math.round(parseFloat(s) * 100)).toBe(before);

        // Display does not mutate the stored value.
        expect(p as number).toBe(before);
      }),
      { numRuns: 300 },
    );
  });

  it('formats representative values correctly', () => {
    const cases: Array<[number, string]> = [
      [12345, '123.45'],
      [5, '0.05'],
      [100, '1.00'],
      [0, '0.00'],
    ];
    for (const [paise, str] of cases) {
      const r = makePaise(paise);
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(toINRString(r.value)).toBe(str);
    }
  });
});
