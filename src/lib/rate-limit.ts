/**
 * Rate limiter — a shared, per-identifier rate-limiting core used by OTP
 * issuance, authentication, admin routes, and AI generation.
 *
 * Two constraints are enforced per identifier per endpoint:
 *   1. Rolling-window maximum: at most `max` requests may be accepted within
 *      any window of `windowSeconds` (Req 6.12, 11.10, 12.10, 23.7, 23.10).
 *   2. Minimum inter-request interval: consecutive accepted requests must be
 *      separated by at least `minIntervalSeconds` (Req 6.12 — OTP ≥30s spacing).
 *
 * Rejected requests are never recorded, so excess requests are rejected without
 * being "processed" and do not consume window budget or reset the interval
 * timer (Req 6.13, 11.11, 23.10 — "perform no processing for those requests").
 *
 * The decision logic ({@link evaluateRateLimit}) is a pure function over the
 * previously accepted timestamps, which makes it cheap to property-test across
 * many generated request sequences (design.md Property 21). The stateful
 * {@link createRateLimiter} wraps that core with an in-memory per-key store.
 *
 * Requirements: 6.12, 6.13, 11.10, 11.11, 12.10, 23.7, 23.10
 */

import type { Config_Service, RateLimit } from '../services/config';

/**
 * A single rate-limit rule: at most `max` accepted requests per rolling
 * `windowSeconds`, with an optional minimum spacing between accepted requests.
 * Mirrors {@link RateLimit} from the Config_Service.
 */
export interface RateLimitConfig {
  /** Maximum accepted requests within the rolling window. Must be >= 0. */
  readonly max: number;
  /** Rolling window length in seconds. Must be > 0. */
  readonly windowSeconds: number;
  /** Optional minimum spacing, in seconds, between consecutive accepted requests. */
  readonly minIntervalSeconds?: number;
}

/** Why a request was rejected by the rate limiter. */
export type RateLimitReason = 'WINDOW_EXCEEDED' | 'MIN_INTERVAL';

/** Outcome of evaluating a request against a rate-limit rule. */
export interface RateLimitDecision {
  /** True when the request is permitted; false when it must be rejected. */
  readonly allowed: boolean;
  /**
   * Remaining accepted requests permitted within the current window after this
   * decision is applied. Never negative.
   */
  readonly remaining: number;
  /** Present only when `allowed` is false; identifies the violated constraint. */
  readonly reason?: RateLimitReason;
  /**
   * Present only when `allowed` is false; the number of whole seconds the caller
   * should wait (rounded up) before a retry could succeed.
   */
  readonly retryAfterSeconds?: number;
}

const MS_PER_SECOND = 1000;

/** Normalize a possibly-invalid config into safe, integer-ish bounds. */
function normalizeConfig(config: RateLimitConfig): {
  max: number;
  windowMs: number;
  minIntervalMs: number;
} {
  const max = Number.isFinite(config.max) && config.max > 0 ? Math.floor(config.max) : 0;
  const windowSeconds =
    Number.isFinite(config.windowSeconds) && config.windowSeconds > 0
      ? config.windowSeconds
      : 0;
  const minIntervalSeconds =
    typeof config.minIntervalSeconds === 'number' &&
    Number.isFinite(config.minIntervalSeconds) &&
    config.minIntervalSeconds > 0
      ? config.minIntervalSeconds
      : 0;
  return {
    max,
    windowMs: windowSeconds * MS_PER_SECOND,
    minIntervalMs: minIntervalSeconds * MS_PER_SECOND,
  };
}

/**
 * Pure decision core: given the timestamps (ms epoch) of previously *accepted*
 * requests for one identifier, decide whether a new request at `now` (ms epoch)
 * is permitted under `config`.
 *
 * The function does not mutate its inputs. Callers that accept the request are
 * responsible for appending `now` to their stored timestamps.
 */
export function evaluateRateLimit(
  acceptedTimestamps: readonly number[],
  config: RateLimitConfig,
  now: number,
): RateLimitDecision {
  const { max, windowMs, minIntervalMs } = normalizeConfig(config);

  // Only timestamps at or after the window start count toward the rolling limit.
  const windowStart = now - windowMs;
  const inWindow = acceptedTimestamps.filter((t) => t > windowStart);
  const countInWindow = inWindow.length;

  const lastAccepted =
    acceptedTimestamps.length === 0 ? undefined : Math.max(...acceptedTimestamps);

  const remainingIfRejected = Math.max(0, max - countInWindow);

  // A max of 0 means the endpoint accepts nothing.
  if (max <= 0) {
    return {
      allowed: false,
      remaining: 0,
      reason: 'WINDOW_EXCEEDED',
    };
  }

  // Constraint 1: minimum inter-request interval between accepted requests.
  if (minIntervalMs > 0 && lastAccepted !== undefined) {
    const sinceLast = now - lastAccepted;
    if (sinceLast < minIntervalMs) {
      return {
        allowed: false,
        remaining: remainingIfRejected,
        reason: 'MIN_INTERVAL',
        retryAfterSeconds: Math.ceil((minIntervalMs - sinceLast) / MS_PER_SECOND),
      };
    }
  }

  // Constraint 2: rolling-window maximum.
  if (countInWindow >= max) {
    // The window frees up when its oldest in-window request exits the window.
    const oldestInWindow = Math.min(...inWindow);
    const retryAfterMs = oldestInWindow + windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      reason: 'WINDOW_EXCEEDED',
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / MS_PER_SECOND)),
    };
  }

  // Accepted: this request consumes one unit of window budget.
  return {
    allowed: true,
    remaining: Math.max(0, max - (countInWindow + 1)),
  };
}

/** Stateful, per-identifier rate limiter over one or more named endpoints. */
export interface RateLimiter {
  /**
   * Evaluate a request for `identifier` against the rule registered under
   * `endpointKey`. When permitted, the request timestamp is recorded so it
   * counts toward subsequent decisions; when rejected, nothing is recorded.
   *
   * Unknown endpoint keys are treated as unlimited (always allowed) so that a
   * missing rule never blocks traffic silently — callers should register rules
   * for every rate-limited endpoint.
   */
  check(endpointKey: string, identifier: string, now?: number): RateLimitDecision;
  /**
   * Clear recorded history. With no arguments clears everything; with an
   * endpoint key clears that endpoint; with both clears a single identifier.
   */
  reset(endpointKey?: string, identifier?: string): void;
}

export interface RateLimiterOptions {
  /** Named rate-limit rules, keyed by endpoint (e.g. `otpRequest`, `admin`). */
  readonly limits: Record<string, RateLimitConfig>;
  /** Clock injection for testing; defaults to `Date.now`. */
  readonly now?: () => number;
}

/**
 * Create an in-memory rate limiter from a map of named rules. State is held per
 * `endpointKey` → `identifier` → accepted timestamps.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const clock = options.now ?? (() => Date.now());
  const rules = options.limits;
  // endpointKey -> identifier -> accepted timestamps (ms epoch), ascending.
  const store = new Map<string, Map<string, number[]>>();

  function bucketFor(endpointKey: string, identifier: string): number[] {
    let byIdentifier = store.get(endpointKey);
    if (byIdentifier === undefined) {
      byIdentifier = new Map<string, number[]>();
      store.set(endpointKey, byIdentifier);
    }
    let timestamps = byIdentifier.get(identifier);
    if (timestamps === undefined) {
      timestamps = [];
      byIdentifier.set(identifier, timestamps);
    }
    return timestamps;
  }

  return {
    check(endpointKey, identifier, now): RateLimitDecision {
      const at = now ?? clock();
      const config = rules[endpointKey];

      // No rule registered => unlimited. Report a large remaining budget.
      if (config === undefined) {
        return { allowed: true, remaining: Number.MAX_SAFE_INTEGER };
      }

      const timestamps = bucketFor(endpointKey, identifier);

      // Prune timestamps that can no longer affect any future decision so the
      // store does not grow without bound.
      const windowMs = config.windowSeconds * MS_PER_SECOND;
      const cutoff = at - windowMs;
      let pruneCount = 0;
      while (pruneCount < timestamps.length) {
        const ts = timestamps[pruneCount];
        if (ts === undefined || ts > cutoff) break;
        pruneCount += 1;
      }
      if (pruneCount > 0) timestamps.splice(0, pruneCount);

      const decision = evaluateRateLimit(timestamps, config, at);
      if (decision.allowed) {
        timestamps.push(at);
      }
      return decision;
    },

    reset(endpointKey, identifier): void {
      if (endpointKey === undefined) {
        store.clear();
        return;
      }
      const byIdentifier = store.get(endpointKey);
      if (byIdentifier === undefined) return;
      if (identifier === undefined) {
        byIdentifier.clear();
        return;
      }
      byIdentifier.delete(identifier);
    },
  };
}

/**
 * Convenience factory that wires a {@link RateLimiter} to the rules exposed by
 * the Config_Service (`config.rateLimits()`), including OTP spacing defaults
 * (≤3 per 10 minutes, ≥30s apart — Req 6.12).
 */
export function createConfiguredRateLimiter(
  config: Config_Service,
  now?: () => number,
): RateLimiter {
  const limits = config.rateLimits() as Record<string, RateLimit>;
  return createRateLimiter({ limits, now });
}
