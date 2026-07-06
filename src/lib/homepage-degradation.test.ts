import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  decideDegradation,
  isConnectionSlowerThan4g,
  isLowEndDevice,
  LIBRARY_LOAD_TIMEOUT_MS,
  MIN_DEVICE_MEMORY_GB,
  MIN_LOGICAL_CORES,
  type EffectiveConnectionType,
  type EnvironmentDescriptor,
} from './homepage-degradation';

/**
 * Property tests for the homepage graceful-degradation core (task 6.3).
 *
 * Property 12 is validated here against the pure decision function; the unit
 * examples below anchor the boundary cases (4 GB memory, 4 cores, the 4g
 * connection cutoff, and the library-load timeout).
 */

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const CONNECTION_TYPES: readonly EffectiveConnectionType[] = [
  'slow-2g',
  '2g',
  '3g',
  '4g',
  'unknown',
];

/**
 * Spans the full environment space: JS on/off, reduced-motion on/off, device
 * memory (incl. null and values straddling the 4 GB cutoff), logical cores
 * (incl. null and values around 4), effective connection type (incl. null and
 * 'unknown'), and whether the animation libraries loaded within the timeout.
 */
const envDescriptorArb: fc.Arbitrary<EnvironmentDescriptor> = fc.record({
  javascriptEnabled: fc.boolean(),
  prefersReducedMotion: fc.boolean(),
  deviceMemoryGb: fc.option(
    fc.double({ min: 0, max: 32, noNaN: true, noDefaultInfinity: true }),
    { nil: null },
  ),
  logicalCores: fc.option(fc.integer({ min: 0, max: 32 }), { nil: null }),
  effectiveConnectionType: fc.option(fc.constantFrom(...CONNECTION_TYPES), {
    nil: null,
  }),
  librariesLoadedWithinTimeout: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Property 12: Homepage degradation decision
// ---------------------------------------------------------------------------

// Feature: corporate-cult-ecommerce, Property 12: Homepage degradation decision
describe('Property 12: Homepage degradation decision', () => {
  // Validates: Requirements 4.2, 4.3, 4.7, 4.10
  it('enables animations only when JS is on, motion is not reduced, and libraries loaded in time', () => {
    fc.assert(
      fc.property(envDescriptorArb, (env) => {
        const decision = decideDegradation(env);
        const expectedAnimations =
          env.javascriptEnabled &&
          !env.prefersReducedMotion &&
          env.librariesLoadedWithinTimeout;
        expect(decision.animationsEnabled).toBe(expectedAnimations);
      }),
      { numRuns: 300 },
    );
  });

  // Validates: Requirements 4.2, 4.3, 4.10
  it('renders static fallbacks (animations off) when JS disabled, reduced-motion, or libraries timed out', () => {
    fc.assert(
      fc.property(envDescriptorArb, (env) => {
        const decision = decideDegradation(env);
        if (
          !env.javascriptEnabled ||
          env.prefersReducedMotion ||
          !env.librariesLoadedWithinTimeout
        ) {
          expect(decision.animationsEnabled).toBe(false);
          expect(decision.threeDSceneEnabled).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });

  // Validates: Requirements 4.7
  it('enables the 3D scene only when animations are on, motion is not reduced, and the device is not low-end', () => {
    fc.assert(
      fc.property(envDescriptorArb, (env) => {
        const decision = decideDegradation(env);
        const expectedThreeD =
          decision.animationsEnabled &&
          !env.prefersReducedMotion &&
          !isLowEndDevice(env);
        expect(decision.threeDSceneEnabled).toBe(expectedThreeD);
      }),
      { numRuns: 300 },
    );
  });

  // Validates: Requirements 4.7
  it('disables the 3D scene whenever the device is low-end or reduced-motion is requested', () => {
    fc.assert(
      fc.property(envDescriptorArb, (env) => {
        const decision = decideDegradation(env);
        if (isLowEndDevice(env) || env.prefersReducedMotion) {
          expect(decision.threeDSceneEnabled).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });

  // Validates: Requirements 4.2, 4.7 — 3D can never run without animations.
  it('never enables the 3D scene without also enabling animations', () => {
    fc.assert(
      fc.property(envDescriptorArb, (env) => {
        const decision = decideDegradation(env);
        if (decision.threeDSceneEnabled) {
          expect(decision.animationsEnabled).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  // Validates: Requirements 4.7 — low-end classification matches the documented thresholds.
  it('classifies low-end exactly when memory < 4 GB, cores < 4, or connection slower than 4g (unknown never forces low-end)', () => {
    fc.assert(
      fc.property(envDescriptorArb, (env) => {
        const lowMemory =
          env.deviceMemoryGb !== null && env.deviceMemoryGb < MIN_DEVICE_MEMORY_GB;
        const fewCores =
          env.logicalCores !== null && env.logicalCores < MIN_LOGICAL_CORES;
        const slowNet = isConnectionSlowerThan4g(env.effectiveConnectionType);
        expect(isLowEndDevice(env)).toBe(lowMemory || fewCores || slowNet);
      }),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// Boundary unit examples (anchor the property thresholds)
// ---------------------------------------------------------------------------

function baseEnv(overrides: Partial<EnvironmentDescriptor> = {}): EnvironmentDescriptor {
  return {
    javascriptEnabled: true,
    prefersReducedMotion: false,
    deviceMemoryGb: 8,
    logicalCores: 8,
    effectiveConnectionType: '4g',
    librariesLoadedWithinTimeout: true,
    ...overrides,
  };
}

describe('decideDegradation boundary examples', () => {
  it('enables both animations and 3D for a capable, JS-enabled environment', () => {
    const decision = decideDegradation(baseEnv());
    expect(decision.animationsEnabled).toBe(true);
    expect(decision.threeDSceneEnabled).toBe(true);
    expect(decision.reasons).toEqual([]);
  });

  it('treats exactly 4 GB / 4 cores / 4g as capable (not low-end)', () => {
    expect(
      isLowEndDevice(
        baseEnv({ deviceMemoryGb: MIN_DEVICE_MEMORY_GB, logicalCores: MIN_LOGICAL_CORES }),
      ),
    ).toBe(false);
  });

  it('treats just below 4 GB or 4 cores as low-end and disables the 3D scene', () => {
    const lowMem = decideDegradation(baseEnv({ deviceMemoryGb: MIN_DEVICE_MEMORY_GB - 0.1 }));
    expect(lowMem.threeDSceneEnabled).toBe(false);
    expect(lowMem.animationsEnabled).toBe(true);
    expect(lowMem.reasons).toContain('low-end-device');

    const fewCores = decideDegradation(baseEnv({ logicalCores: MIN_LOGICAL_CORES - 1 }));
    expect(fewCores.threeDSceneEnabled).toBe(false);
  });

  it('does not treat null or unknown signals as low-end', () => {
    expect(
      isLowEndDevice(
        baseEnv({
          deviceMemoryGb: null,
          logicalCores: null,
          effectiveConnectionType: null,
        }),
      ),
    ).toBe(false);
    expect(isConnectionSlowerThan4g(null)).toBe(false);
    expect(isConnectionSlowerThan4g('unknown')).toBe(false);
  });

  it('flags connections slower than 4g as low-end', () => {
    expect(isConnectionSlowerThan4g('slow-2g')).toBe(true);
    expect(isConnectionSlowerThan4g('2g')).toBe(true);
    expect(isConnectionSlowerThan4g('3g')).toBe(true);
    expect(isConnectionSlowerThan4g('4g')).toBe(false);
  });

  it('falls back to static (no animations, no 3D) for reduced-motion, no-JS, or library timeout', () => {
    expect(decideDegradation(baseEnv({ prefersReducedMotion: true })).animationsEnabled).toBe(
      false,
    );
    expect(decideDegradation(baseEnv({ javascriptEnabled: false })).animationsEnabled).toBe(
      false,
    );
    const timedOut = decideDegradation(baseEnv({ librariesLoadedWithinTimeout: false }));
    expect(timedOut.animationsEnabled).toBe(false);
    expect(timedOut.threeDSceneEnabled).toBe(false);
    expect(timedOut.reasons).toContain('library-load-timeout');
  });

  it('exposes a positive library-load timeout constant', () => {
    expect(LIBRARY_LOAD_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
