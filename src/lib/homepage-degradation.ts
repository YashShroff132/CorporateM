/**
 * Homepage graceful-degradation decision core (Requirement 4).
 *
 * This is a PURE module with no I/O, no React, and no browser globals so it can
 * be property-tested in isolation (design Property 12). Given an environment
 * descriptor it decides two things:
 *
 *  1. Whether scroll-driven animations run at all, or whether the homepage
 *     falls back to the static, non-animated sections (Req 4.2, 4.3, 4.10).
 *  2. Whether the optional Three.js 3D scene runs, or whether a static image is
 *     rendered in its place (Req 4.7).
 *
 * The narrative content itself is always server-rendered as static, readable
 * HTML (Req 4.1, 4.3); this decision only governs the *enhancement* layer that
 * loads after First Contentful Paint (Req 4.6).
 */

/**
 * Effective connection type as reported by the Network Information API
 * (`navigator.connection.effectiveType`). `null`/`'unknown'` means the browser
 * did not report a value.
 */
export type EffectiveConnectionType = 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';

/**
 * A normalized description of the visitor's environment. Every field is a plain
 * value so the decision function stays pure and trivially testable. Fields that
 * a browser may fail to report are nullable; `null` means "unknown" and is
 * treated conservatively (it never, on its own, forces the 3D scene off).
 */
export interface EnvironmentDescriptor {
  /** Whether JavaScript is executing. Server/no-JS renders pass `false`. */
  javascriptEnabled: boolean;
  /** `true` when the browser reports `prefers-reduced-motion: reduce`. */
  prefersReducedMotion: boolean;
  /** `navigator.deviceMemory` in gigabytes, or `null` when unknown. */
  deviceMemoryGb: number | null;
  /** `navigator.hardwareConcurrency` (logical cores), or `null` when unknown. */
  logicalCores: number | null;
  /** Effective connection type, or `null` when unknown. */
  effectiveConnectionType: EffectiveConnectionType | null;
  /**
   * Whether the code-split GSAP/Three.js libraries finished loading within the
   * allowed timeout window (Req 4.10). `false` means they failed or timed out.
   */
  librariesLoadedWithinTimeout: boolean;
}

/** The outcome of the degradation decision. */
export interface DegradationDecision {
  /**
   * When `false`, the homepage renders the static, non-animated sections in
   * place of the scroll-driven animations (Req 4.2, 4.3, 4.10).
   */
  animationsEnabled: boolean;
  /**
   * When `false`, the Three.js 3D scene is disabled and a static image is
   * rendered in its place (Req 4.7). Always `false` when animations are off.
   */
  threeDSceneEnabled: boolean;
  /** Human-readable factors that caused any downgrade (for diagnostics/tests). */
  reasons: string[];
}

/** The maximum time (ms) allowed for the animation libraries to load (Req 4.10). */
export const LIBRARY_LOAD_TIMEOUT_MS = 5000;

/** Minimum device memory (GB) required to run the 3D scene (Req 4.7). */
export const MIN_DEVICE_MEMORY_GB = 4;

/** Minimum logical processor cores required to run the 3D scene (Req 4.7). */
export const MIN_LOGICAL_CORES = 4;

/** Ordering of connection types from slowest to fastest for comparison. */
const CONNECTION_RANK: Record<Exclude<EffectiveConnectionType, 'unknown'>, number> = {
  'slow-2g': 0,
  '2g': 1,
  '3g': 2,
  '4g': 3,
};

/**
 * Whether the effective connection is strictly slower than 4g (Req 4.7).
 * Unknown/null connections are NOT considered slow — we do not downgrade on
 * missing information.
 */
export function isConnectionSlowerThan4g(
  connection: EffectiveConnectionType | null,
): boolean {
  if (connection === null || connection === 'unknown') return false;
  return CONNECTION_RANK[connection] < CONNECTION_RANK['4g'];
}

/**
 * Whether the device is "low-end" for the purposes of the 3D scene: device
 * memory below 4 GB, fewer than 4 logical cores, or a connection slower than 4g
 * (Req 4.7). Unknown values do not, by themselves, mark a device as low-end.
 */
export function isLowEndDevice(env: EnvironmentDescriptor): boolean {
  const lowMemory = env.deviceMemoryGb !== null && env.deviceMemoryGb < MIN_DEVICE_MEMORY_GB;
  const fewCores = env.logicalCores !== null && env.logicalCores < MIN_LOGICAL_CORES;
  const slowNetwork = isConnectionSlowerThan4g(env.effectiveConnectionType);
  return lowMemory || fewCores || slowNetwork;
}

/**
 * Decide how the homepage enhancement layer should degrade for a given
 * environment (design Property 12; Req 4.2, 4.3, 4.7, 4.10).
 *
 * Animations are enabled only when JavaScript is running, the visitor has not
 * requested reduced motion, and the animation libraries loaded within the
 * timeout. The 3D scene additionally requires a capable device — and is never
 * enabled when animations are off.
 */
export function decideDegradation(env: EnvironmentDescriptor): DegradationDecision {
  const reasons: string[] = [];

  if (!env.javascriptEnabled) reasons.push('javascript-disabled');
  if (env.prefersReducedMotion) reasons.push('prefers-reduced-motion');
  if (!env.librariesLoadedWithinTimeout) reasons.push('library-load-timeout');

  const animationsEnabled =
    env.javascriptEnabled && !env.prefersReducedMotion && env.librariesLoadedWithinTimeout;

  const lowEnd = isLowEndDevice(env);
  if (lowEnd) reasons.push('low-end-device');

  const threeDSceneEnabled = animationsEnabled && !env.prefersReducedMotion && !lowEnd;

  return { animationsEnabled, threeDSceneEnabled, reasons };
}
