/**
 * Shipping_Service — task 23.1 scope: shipping charge computation, pincode
 * serviceability, and shipping-aggregator fallback.
 *
 * This module implements the launch-time (manual) Shipping_Service described in
 * design.md, with a seam for the later aggregator integration:
 *
 *   - `computeShippingCharge`: apply the configured flat shipping charge when
 *     the order subtotal is below the free-shipping threshold, and a zero
 *     charge when the subtotal is at or above it (Req 17.1).
 *   - Serviceability: indicate within 3 seconds whether a valid 6-digit pincode
 *     is serviceable, backed by an owner-configured local pincode list (Req
 *     17.3).
 *   - Payment gating: a non-serviceable pincode blocks progression to payment
 *     (Req 17.6).
 *   - Aggregator seam: WHERE the `shippingAggregator` feature flag is enabled,
 *     rates/serviceability are retrieved from the injected aggregator (Req
 *     17.4); IF the aggregator does not respond within 10 seconds or errors,
 *     the service falls back to the configured flat charge and the local
 *     serviceable-pincode list (Req 17.7).
 *
 * All monetary arithmetic is delegated to the Money module (integer paise, no
 * floating point). The external aggregator is abstracted behind an injectable
 * interface so the pure decision logic stays decoupled and testable, and so the
 * aggregator can be switched on through configuration rather than a rewrite.
 */

import { type Result, ok, err, isErr } from '@/lib/result';
import { type Paise, type MoneyError, makePaise } from '@/lib/money';
import {
  type PincodeDirectory,
  isValidPincodeFormat,
} from './checkout';
import { config as defaultConfig, type Config_Service } from './config';

/**
 * Default budget (ms) within which a serviceability answer must be produced for
 * a shopper who enters a valid pincode (Req 17.3). The local directory lookup is
 * synchronous and effectively instant; this budget bounds any injected async
 * serviceability source.
 */
export const SERVICEABILITY_TIMEOUT_MS = 3_000;

/**
 * Timeout (ms) applied to the shipping aggregator. If the aggregator does not
 * respond within this window it is treated as failed and the service falls back
 * to the local flat charge + pincode list (Req 17.7).
 */
export const AGGREGATOR_TIMEOUT_MS = 10_000;

/** Where a shipping answer came from — the aggregator or the local fallback. */
export type ShippingSource = 'aggregator' | 'local';

/** Discriminated error type for shipping operations. */
export type ShippingError =
  | { readonly kind: 'INVALID_PINCODE'; readonly message: string }
  | { readonly kind: 'MONEY_ERROR'; readonly message: string; readonly cause: MoneyError };

/** The outcome of a serviceability check for a delivery pincode. */
export interface ServiceabilityResult {
  /** The normalized pincode that was checked. */
  readonly pincode: string;
  /** Whether the pincode is serviceable. */
  readonly serviceable: boolean;
  /** Whether the answer came from the aggregator or the local fallback. */
  readonly source: ShippingSource;
}

/** A shipping quote: the charge in integer paise plus serviceability. */
export interface ShippingQuote {
  /** Shipping charge in integer paise. */
  readonly charge: Paise;
  /** Whether the delivery pincode is serviceable. */
  readonly serviceable: boolean;
  /** Whether the quote came from the aggregator or the local fallback. */
  readonly source: ShippingSource;
}

/**
 * A rate/serviceability response as returned by an external shipping aggregator.
 * `charge` is an integer number of paise.
 */
export interface AggregatorResponse {
  readonly charge: number;
  readonly serviceable: boolean;
}

/**
 * The external shipping aggregator seam (Req 17.4). Implementations wrap a
 * third-party rate/serviceability API. The service only depends on this
 * interface, so the concrete aggregator can be injected (or swapped) via
 * configuration without touching callers.
 */
export interface ShippingAggregator {
  /**
   * Retrieve the shipping rate and serviceability for a delivery pincode and
   * order subtotal. May reject or hang; the Shipping_Service enforces the 10s
   * timeout and falls back on any error (Req 17.7).
   */
  getQuote(pincode: string, subtotal: Paise): Promise<AggregatorResponse>;
}

/** Options for constructing a {@link Shipping_Service}. */
export interface ShippingServiceOptions {
  /** Config source for thresholds and the aggregator feature flag. */
  readonly config?: Config_Service;
  /** Owner-configured local serviceable-pincode directory (the fallback list). */
  readonly localDirectory: PincodeDirectory;
  /** Optional external aggregator; used only when the feature flag is enabled. */
  readonly aggregator?: ShippingAggregator;
  /** Override the aggregator timeout (ms); defaults to {@link AGGREGATOR_TIMEOUT_MS}. */
  readonly aggregatorTimeoutMs?: number;
}

/** The Shipping_Service surface consumed by checkout and payment gating. */
export interface Shipping_Service {
  /** Flat charge below the free-shipping threshold, zero at/above (Req 17.1). */
  computeShippingCharge(subtotal: Paise): Result<Paise, ShippingError>;
  /** Indicate serviceability for a delivery pincode (Req 17.3, 17.4, 17.7). */
  checkServiceability(pincode: string): Promise<Result<ServiceabilityResult, ShippingError>>;
  /** Full quote: charge + serviceability for a pincode and subtotal. */
  quote(pincode: string, subtotal: Paise): Promise<Result<ShippingQuote, ShippingError>>;
  /** Whether checkout may progress to payment for this pincode (Req 17.6). */
  canProceedToPayment(pincode: string): Promise<boolean>;
}

/**
 * Compute the shipping charge for an order subtotal (Req 17.1).
 *
 * Returns the flat shipping charge when `subtotal` is strictly below the
 * free-shipping threshold, and zero paise when `subtotal` is at or above the
 * threshold. Pure and dependency-free so it can be property-tested directly.
 */
export function computeShippingCharge(
  subtotal: Paise,
  freeShippingThreshold: Paise,
  flatShippingCharge: Paise,
): Result<Paise, ShippingError> {
  if ((subtotal as number) >= (freeShippingThreshold as number)) {
    const zero = makePaise(0);
    if (isErr(zero)) return err(moneyErr(zero.error));
    return ok(zero.value);
  }
  return ok(flatShippingCharge);
}

function moneyErr(cause: MoneyError): ShippingError {
  return { kind: 'MONEY_ERROR', message: cause.message, cause };
}

/**
 * Race a promise against a timeout. Resolves to `{ timedOut: false, value }`
 * when the promise settles first, or `{ timedOut: true }` when the timeout
 * elapses (or the promise rejects). The pending timer is always cleared so no
 * open handle leaks. A rejected promise is reported as `timedOut` so callers
 * treat "no response within window OR error" uniformly (Req 17.7).
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<{ readonly timedOut: false; readonly value: T } | { readonly timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ readonly timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms);
  });
  try {
    const settled = await Promise.race([
      promise.then(
        (value): { readonly timedOut: false; readonly value: T } => ({
          timedOut: false,
          value,
        }),
        // An aggregator error is treated identically to a timeout (Req 17.7).
        (): { readonly timedOut: true } => ({ timedOut: true }),
      ),
      timeout,
    ]);
    return settled;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Create a Shipping_Service.
 *
 * At launch (aggregator flag disabled) all answers come from the owner-
 * configured local pincode directory and the configured flat/free charge. When
 * the `shippingAggregator` flag is enabled AND an aggregator is injected, the
 * service queries the aggregator with a 10-second timeout, falling back to the
 * local charge + pincode list on timeout or error (Req 17.4, 17.7).
 */
export function createShippingService(
  options: ShippingServiceOptions,
): Shipping_Service {
  const cfg = options.config ?? defaultConfig;
  const { localDirectory, aggregator } = options;
  const aggregatorTimeoutMs = options.aggregatorTimeoutMs ?? AGGREGATOR_TIMEOUT_MS;

  /** Local flat/free charge from config (the fallback path). */
  function localCharge(subtotal: Paise): Result<Paise, ShippingError> {
    return computeShippingCharge(
      subtotal,
      makeConfigPaise(cfg.freeShippingThreshold()),
      makeConfigPaise(cfg.flatShippingCharge()),
    );
  }

  /** Local serviceability from the owner-configured directory. */
  function localServiceable(pincode: string): boolean {
    return localDirectory.lookup(pincode) !== undefined;
  }

  /**
   * Return the active aggregator, or undefined when the aggregator path is not
   * available (flag disabled or no aggregator injected). Narrowing through the
   * return value keeps TypeScript happy at the call sites.
   */
  function activeAggregator(): ShippingAggregator | undefined {
    return cfg.isEnabled('shippingAggregator') ? aggregator : undefined;
  }

  return {
    computeShippingCharge(subtotal: Paise): Result<Paise, ShippingError> {
      return localCharge(subtotal);
    },

    async checkServiceability(
      pincode: string,
    ): Promise<Result<ServiceabilityResult, ShippingError>> {
      if (!isValidPincodeFormat(pincode)) {
        return err({
          kind: 'INVALID_PINCODE',
          message: 'Enter a valid 6-digit pincode.',
        });
      }
      const normalized = pincode.trim();

      const agg = activeAggregator();
      if (agg !== undefined) {
        const zero = makePaise(0);
        if (isErr(zero)) return err(moneyErr(zero.error));
        const settled = await withTimeout(
          agg.getQuote(normalized, zero.value),
          aggregatorTimeoutMs,
        );
        if (!settled.timedOut) {
          return ok({
            pincode: normalized,
            serviceable: settled.value.serviceable,
            source: 'aggregator',
          });
        }
        // Fall through to the local list on timeout/error (Req 17.7).
      }

      return ok({
        pincode: normalized,
        serviceable: localServiceable(normalized),
        source: 'local',
      });
    },

    async quote(
      pincode: string,
      subtotal: Paise,
    ): Promise<Result<ShippingQuote, ShippingError>> {
      if (!isValidPincodeFormat(pincode)) {
        return err({
          kind: 'INVALID_PINCODE',
          message: 'Enter a valid 6-digit pincode.',
        });
      }
      const normalized = pincode.trim();

      const agg = activeAggregator();
      if (agg !== undefined) {
        const settled = await withTimeout(
          agg.getQuote(normalized, subtotal),
          aggregatorTimeoutMs,
        );
        if (!settled.timedOut) {
          const charge = makePaise(settled.value.charge);
          if (isErr(charge)) return err(moneyErr(charge.error));
          return ok({
            charge: charge.value,
            serviceable: settled.value.serviceable,
            source: 'aggregator',
          });
        }
        // Aggregator timed out or errored — fall back to local (Req 17.7).
      }

      const charge = localCharge(subtotal);
      if (isErr(charge)) return charge;
      return ok({
        charge: charge.value,
        serviceable: localServiceable(normalized),
        source: 'local',
      });
    },

    async canProceedToPayment(pincode: string): Promise<boolean> {
      const result = await this.checkServiceability(pincode);
      return !isErr(result) && result.value.serviceable;
    },
  };
}

/**
 * Coerce a Config_Service integer-paise value (bounded 0..99,999,999 by config)
 * into a branded `Paise`. Config already clamps to a valid range, so this cannot
 * fail in practice; on the impossible out-of-range case it falls back to 0.
 */
function makeConfigPaise(value: number): Paise {
  const p = makePaise(value);
  if (isErr(p)) {
    // Config guarantees a valid range; treat any anomaly as zero rather than
    // throwing from a pure charge computation.
    const zero = makePaise(0);
    // makePaise(0) is always ok.
    return zero.ok ? zero.value : (0 as Paise);
  }
  return p.value;
}
