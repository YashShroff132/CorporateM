import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

// Smoke test verifying the Vitest runner and fast-check are wired correctly.
describe('project tooling setup', () => {
  it('runs a basic unit assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('runs a fast-check property (integer addition is commutative)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
      { numRuns: 100 },
    );
  });
});
