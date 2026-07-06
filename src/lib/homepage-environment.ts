/**
 * Browser environment probing for the homepage degradation decision (Req 4.7).
 *
 * This module is the thin, impure boundary that reads browser globals and
 * produces the plain {@link EnvironmentDescriptor} consumed by the pure
 * {@link decideDegradation} core. Keeping the reads here (and out of the pure
 * module) preserves the testability of the decision logic.
 */

import type {
  EffectiveConnectionType,
  EnvironmentDescriptor,
} from './homepage-degradation';

/** Minimal shape of the Network Information API we rely on. */
interface NetworkInformationLike {
  effectiveType?: string;
}

/** Minimal shape of the navigator extensions we read (all optional). */
interface NavigatorLike {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: NetworkInformationLike;
}

const KNOWN_CONNECTION_TYPES: readonly EffectiveConnectionType[] = [
  'slow-2g',
  '2g',
  '3g',
  '4g',
];

function normalizeConnection(raw: string | undefined): EffectiveConnectionType | null {
  if (raw === undefined) return null;
  return (KNOWN_CONNECTION_TYPES as readonly string[]).includes(raw)
    ? (raw as EffectiveConnectionType)
    : null;
}

/**
 * Read the current browser environment into a descriptor. Missing values are
 * reported as `null` so the pure decision treats them conservatively.
 *
 * `librariesLoadedWithinTimeout` is supplied by the caller because it reflects
 * the outcome of the code-split dynamic import race, not a static browser fact.
 */
export function readBrowserEnvironment(
  librariesLoadedWithinTimeout: boolean,
): EnvironmentDescriptor {
  // Guard for non-browser contexts (SSR); callers only invoke this client-side.
  const hasWindow = typeof window !== 'undefined';
  const nav: NavigatorLike =
    typeof navigator !== 'undefined' ? (navigator as unknown as NavigatorLike) : {};

  const prefersReducedMotion =
    hasWindow && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  return {
    javascriptEnabled: true, // if this code runs, JS is enabled
    prefersReducedMotion,
    deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    logicalCores:
      typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    effectiveConnectionType: normalizeConnection(nav.connection?.effectiveType),
    librariesLoadedWithinTimeout,
  };
}
