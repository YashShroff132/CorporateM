/**
 * Config_Service — brand configuration, feature flags, tax/shipping settings,
 * thresholds, integrations, and startup validation.
 *
 * Design tenets honored here (see design.md / requirements.md):
 * - Owner inputs are configuration, never literals. Every value below is sourced
 *   from the environment (or seed data) rather than hardcoded (Req 22.1).
 * - Every feature flag defaults to DISABLED (Req 22.2). A capability is enabled
 *   only when its env variable is explicitly set to a truthy value.
 * - Values are read on each access so a changed flag/config takes effect without
 *   a rebuild (supports Req 22.7 — apply within 60s).
 * - `validateStartup()` fails fast, identifying every missing/invalid required
 *   configuration value (Req 22.6).
 *
 * Monetary values are integer paise (`number`). The branded `Paise` type from the
 * Money module (task 1.2) is intentionally not imported here to keep this
 * foundational module decoupled; callers should treat these as integer paise.
 */

/** Integer paise. 1 INR = 100 paise. */
export type Paise = number;

/** The complete set of non-MVP capability feature flags (Req 22.2). */
export type Flag =
  | 'aiStudio'
  | 'reviews'
  | 'homepage3D'
  | 'pod'
  | 'shippingAggregator'
  | 'whatsapp'
  | 'referral'
  | 'abandonedCart';

/** Environment variable name backing each feature flag. */
const FLAG_ENV: Record<Flag, string> = {
  aiStudio: 'FLAG_AI_STUDIO',
  reviews: 'FLAG_REVIEWS',
  homepage3D: 'FLAG_HOMEPAGE_3D',
  pod: 'FLAG_POD',
  shippingAggregator: 'FLAG_SHIPPING_AGGREGATOR',
  whatsapp: 'FLAG_WHATSAPP',
  referral: 'FLAG_REFERRAL',
  abandonedCart: 'FLAG_ABANDONED_CART',
};

/** All known flags, in a stable order. */
export const ALL_FLAGS: readonly Flag[] = Object.keys(FLAG_ENV) as Flag[];

export interface BrandConfig {
  name: string; // 1..100 chars (Req 22.1)
  logoUrl: string;
  colorTokens: Record<string, string>;
}

export interface CodLimits {
  min: Paise;
  max: Paise;
}

export interface ModerationThresholds {
  review: number; // 0..1
  autoReject: number; // 0..1, review < autoReject
}

export interface RateLimit {
  max: number;
  windowSeconds: number;
  minIntervalSeconds?: number;
}

export interface Config_Service {
  brand(): BrandConfig;
  isEnabled(flag: Flag): boolean;
  gstRatePercent(): number;
  sellerGstin(): string;
  garmentHsn(): string;
  sellerState(): string;
  legalEntityName(): string;
  legalEntityAddress(): string;
  freeShippingThreshold(): Paise;
  flatShippingCharge(): Paise;
  codLimits(): CodLimits;
  moderationThresholds(): ModerationThresholds;
  claudeModelId(): string;
  razorpayKeyId(): string;
  razorpayKeySecret(): string;
  razorpayWebhookSecret(): string;
  timezone(): string;
  lowStockThreshold(): number;
  crossSellCount(): number;
  returnsWindow(): string;
  dispatchTime(): string;
  notificationMaxRetries(): number;
  rateLimits(): Record<string, RateLimit>;
  validateStartup(): void;
}

/** Error thrown by {@link Config_Service.validateStartup} when config is missing/invalid. */
export class StartupConfigError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `Startup configuration validation failed. Missing or invalid: ${missing.join(', ')}`,
    );
    this.name = 'StartupConfigError';
    this.missing = [...missing];
  }
}

/** Value-range and format bounds sourced from the design/requirements. */
const BRAND_NAME_MIN = 1;
const BRAND_NAME_MAX = 100; // Req 22.1
const GST_RATE_MIN = 0;
const GST_RATE_MAX = 28; // Req 9.1
const GSTIN_LENGTH = 15; // Req 9.6
const MONEY_FIELD_MAX = 99_999_999; // Req 17.2 threshold / paise field bound

// Documented defaults for optional operational config. Required brand/tax/legal
// values have no silent default — they are enforced by validateStartup().
const DEFAULT_GST_RATE_PERCENT = 5;
const DEFAULT_FREE_SHIPPING_THRESHOLD: Paise = 99_900; // ₹999
const DEFAULT_FLAT_SHIPPING_CHARGE: Paise = 7_900; // ₹79
const DEFAULT_COD_MIN: Paise = 0;
const DEFAULT_COD_MAX: Paise = 500_000; // ₹5,000
// LENIENT moderation defaults (Owner_Input request): only NEAR-CERTAIN policy
// violations are auto-rejected by score, so good/edgy slogan ideas are not
// thrown away by the automatic safety check. The review band starts high (0.75)
// and auto-reject is very high (0.95): a candidate must score >= 0.95 to be
// auto-rejected on score alone, and only the [0.75, 0.95) band is sent to human
// review. Everything below 0.75 is ADMITted directly. In short — borderline
// content goes to review (not reject), and the vast majority of on-brand
// slogans are admitted.
//
// IMPORTANT: this leniency applies ONLY to the numeric score bands. Prohibited
// *categories* (real hate/slurs/protected-class, real-entity defamation,
// sexual, harassment, threats, self-harm, illegal activity) ALWAYS auto-reject
// regardless of score — that hard safety/legal floor lives in the
// Moderation_Gate's pure route() and is unaffected by these numbers.
// Tunable via MODERATION_REVIEW_THRESHOLD / MODERATION_AUTO_REJECT_THRESHOLD.
const DEFAULT_MODERATION_REVIEW = 0.75;
const DEFAULT_MODERATION_AUTO_REJECT = 0.95;
const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const DEFAULT_LOW_STOCK_THRESHOLD = 5;
const DEFAULT_CROSS_SELL_COUNT = 4;
const DEFAULT_RETURNS_WINDOW = '7 days';
const DEFAULT_DISPATCH_TIME = '2-3 business days';
// Owner_Input maximum notification delivery retry count (Req 18.4). Defaults to
// a small, safe bound so retry logic is exercised without unbounded attempts.
const DEFAULT_NOTIFICATION_MAX_RETRIES = 3;

type Env = Record<string, string | undefined>;

function read(env: Env, key: string): string | undefined {
  const raw = env[key];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** A flag is enabled only when explicitly set to a recognized truthy token. */
function readBool(env: Env, key: string): boolean {
  const v = read(env, key)?.toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function readInt(env: Env, key: string, fallback: number): number {
  const v = read(env, key);
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isInteger(n) ? n : fallback;
}

function readFloat(env: Env, key: string, fallback: number): number {
  const v = read(env, key);
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isInteger(n)) return fallback;
  if (n < min || n > max) return fallback;
  return n;
}

function parseColorTokens(raw: string | undefined): Record<string, string> {
  if (raw === undefined) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof val === 'string') out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function parseRateLimits(env: Env): Record<string, RateLimit> {
  // Defaults align with Req 6.12 (OTP: <=3/10min, >=30s spacing) and Req 23.7.
  const defaults: Record<string, RateLimit> = {
    otpRequest: { max: 3, windowSeconds: 600, minIntervalSeconds: 30 },
    auth: { max: 10, windowSeconds: 600 },
    aiGeneration: { max: 10, windowSeconds: 3600 },
    admin: { max: 120, windowSeconds: 60 },
  };

  const raw = read(env, 'RATE_LIMITS');
  if (raw === undefined) return defaults;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaults;
    }
    const merged: Record<string, RateLimit> = { ...defaults };
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (val === null || typeof val !== 'object') continue;
      const candidate = val as Record<string, unknown>;
      const max = candidate.max;
      const windowSeconds = candidate.windowSeconds;
      if (typeof max !== 'number' || typeof windowSeconds !== 'number') continue;
      if (!Number.isInteger(max) || !Number.isInteger(windowSeconds)) continue;
      if (max < 0 || windowSeconds <= 0) continue;
      const limit: RateLimit = { max, windowSeconds };
      if (
        typeof candidate.minIntervalSeconds === 'number' &&
        Number.isFinite(candidate.minIntervalSeconds) &&
        candidate.minIntervalSeconds >= 0
      ) {
        limit.minIntervalSeconds = candidate.minIntervalSeconds;
      }
      merged[key] = limit;
    }
    return merged;
  } catch {
    return defaults;
  }
}

/**
 * Create a Config_Service backed by the given environment (defaults to
 * `process.env`). Reads are performed lazily on each accessor call so that a
 * changed flag/value is reflected without recreating the service (Req 22.7).
 */
export function createConfigService(env: Env = process.env): Config_Service {
  return {
    brand(): BrandConfig {
      return {
        name: read(env, 'BRAND_NAME') ?? '',
        logoUrl: read(env, 'BRAND_LOGO_URL') ?? '',
        colorTokens: parseColorTokens(read(env, 'BRAND_COLOR_TOKENS')),
      };
    },

    isEnabled(flag: Flag): boolean {
      // Unknown/absent env => disabled by default (Req 22.2).
      return readBool(env, FLAG_ENV[flag]);
    },

    gstRatePercent(): number {
      const n = readFloat(env, 'GST_RATE_PERCENT', DEFAULT_GST_RATE_PERCENT);
      return n >= GST_RATE_MIN && n <= GST_RATE_MAX ? n : DEFAULT_GST_RATE_PERCENT;
    },

    sellerGstin(): string {
      return read(env, 'SELLER_GSTIN') ?? '';
    },

    garmentHsn(): string {
      return read(env, 'GARMENT_HSN') ?? '';
    },

    sellerState(): string {
      // Seller's state of registration; used to decide CGST/SGST vs IGST (Req 9.4).
      return read(env, 'SELLER_STATE') ?? '';
    },

    legalEntityName(): string {
      // Owner_Input legal entity name printed on invoices (Req 9.6).
      return read(env, 'LEGAL_ENTITY_NAME') ?? '';
    },

    legalEntityAddress(): string {
      // Owner_Input legal entity address printed on invoices (Req 9.6).
      return read(env, 'LEGAL_ENTITY_ADDRESS') ?? '';
    },

    freeShippingThreshold(): Paise {
      return clampInt(
        readInt(env, 'FREE_SHIPPING_THRESHOLD_PAISE', DEFAULT_FREE_SHIPPING_THRESHOLD),
        0,
        MONEY_FIELD_MAX,
        DEFAULT_FREE_SHIPPING_THRESHOLD,
      );
    },

    flatShippingCharge(): Paise {
      return clampInt(
        readInt(env, 'FLAT_SHIPPING_CHARGE_PAISE', DEFAULT_FLAT_SHIPPING_CHARGE),
        0,
        MONEY_FIELD_MAX,
        DEFAULT_FLAT_SHIPPING_CHARGE,
      );
    },

    codLimits(): CodLimits {
      const min = clampInt(
        readInt(env, 'COD_MIN_PAISE', DEFAULT_COD_MIN),
        0,
        MONEY_FIELD_MAX,
        DEFAULT_COD_MIN,
      );
      const max = clampInt(
        readInt(env, 'COD_MAX_PAISE', DEFAULT_COD_MAX),
        0,
        MONEY_FIELD_MAX,
        DEFAULT_COD_MAX,
      );
      // Preserve a sensible ordering; fall back to defaults if inverted.
      if (min > max) return { min: DEFAULT_COD_MIN, max: DEFAULT_COD_MAX };
      return { min, max };
    },

    moderationThresholds(): ModerationThresholds {
      const review = readFloat(env, 'MODERATION_REVIEW_THRESHOLD', DEFAULT_MODERATION_REVIEW);
      const autoReject = readFloat(
        env,
        'MODERATION_AUTO_REJECT_THRESHOLD',
        DEFAULT_MODERATION_AUTO_REJECT,
      );
      const valid =
        review >= 0 &&
        review <= 1 &&
        autoReject >= 0 &&
        autoReject <= 1 &&
        review < autoReject;
      return valid
        ? { review, autoReject }
        : { review: DEFAULT_MODERATION_REVIEW, autoReject: DEFAULT_MODERATION_AUTO_REJECT };
    },

    claudeModelId(): string {
      // Read from configuration rather than a hardcoded value (Req 12.8).
      return read(env, 'CLAUDE_MODEL_ID') ?? '';
    },

    razorpayKeyId(): string {
      // Razorpay publishable key id, sourced from env only — never hardcoded
      // and never persisted (Req 8.9, design "secrets live only in env").
      return read(env, 'RAZORPAY_KEY_ID') ?? '';
    },

    razorpayKeySecret(): string {
      // Razorpay secret used for server-side signature verification; sourced
      // from env only, never hardcoded and never stored in the DB (Req 8.3, 8.9).
      return read(env, 'RAZORPAY_KEY_SECRET') ?? '';
    },

    razorpayWebhookSecret(): string {
      // Dedicated secret used to verify inbound Razorpay webhook signatures
      // (Req 8.5). Sourced from env only; never hardcoded or persisted (Req 8.9).
      return read(env, 'RAZORPAY_WEBHOOK_SECRET') ?? '';
    },

    timezone(): string {
      return read(env, 'STORE_TIMEZONE') ?? DEFAULT_TIMEZONE;
    },

    lowStockThreshold(): number {
      const n = readInt(env, 'LOW_STOCK_THRESHOLD', DEFAULT_LOW_STOCK_THRESHOLD);
      return n >= 0 ? n : DEFAULT_LOW_STOCK_THRESHOLD;
    },

    crossSellCount(): number {
      const n = readInt(env, 'CROSS_SELL_COUNT', DEFAULT_CROSS_SELL_COUNT);
      return n >= 0 ? n : DEFAULT_CROSS_SELL_COUNT;
    },

    returnsWindow(): string {
      return read(env, 'RETURNS_WINDOW') ?? DEFAULT_RETURNS_WINDOW;
    },

    dispatchTime(): string {
      return read(env, 'DISPATCH_TIME') ?? DEFAULT_DISPATCH_TIME;
    },

    notificationMaxRetries(): number {
      // Owner_Input maximum number of retry attempts after an initial failed
      // delivery (Req 18.4). Must be a non-negative integer; falls back to the
      // documented default otherwise.
      const n = readInt(
        env,
        'NOTIFICATION_MAX_RETRIES',
        DEFAULT_NOTIFICATION_MAX_RETRIES,
      );
      return n >= 0 ? n : DEFAULT_NOTIFICATION_MAX_RETRIES;
    },

    rateLimits(): Record<string, RateLimit> {
      return parseRateLimits(env);
    },

    validateStartup(): void {
      const missing: string[] = [];

      // Required brand configuration (Req 22.1, 22.6).
      const name = read(env, 'BRAND_NAME');
      if (name === undefined) {
        missing.push('BRAND_NAME (brand name is required)');
      } else if (name.length < BRAND_NAME_MIN || name.length > BRAND_NAME_MAX) {
        missing.push(
          `BRAND_NAME (must be ${BRAND_NAME_MIN}..${BRAND_NAME_MAX} characters)`,
        );
      }

      if (read(env, 'BRAND_LOGO_URL') === undefined) {
        missing.push('BRAND_LOGO_URL (brand logo is required)');
      }

      const colorTokensRaw = read(env, 'BRAND_COLOR_TOKENS');
      if (colorTokensRaw === undefined) {
        missing.push('BRAND_COLOR_TOKENS (brand color tokens are required)');
      } else if (Object.keys(parseColorTokens(colorTokensRaw)).length === 0) {
        missing.push('BRAND_COLOR_TOKENS (must be a non-empty JSON object of tokens)');
      }

      // Required tax/legal configuration (Req 9.1, 9.6).
      const gstRaw = read(env, 'GST_RATE_PERCENT');
      if (gstRaw === undefined) {
        missing.push('GST_RATE_PERCENT (GST rate is required)');
      } else {
        const gst = Number(gstRaw);
        if (!Number.isFinite(gst) || gst < GST_RATE_MIN || gst > GST_RATE_MAX) {
          missing.push(
            `GST_RATE_PERCENT (must be a number ${GST_RATE_MIN}..${GST_RATE_MAX})`,
          );
        }
      }

      const gstin = read(env, 'SELLER_GSTIN');
      if (gstin === undefined) {
        missing.push('SELLER_GSTIN (seller GSTIN is required)');
      } else if (gstin.length !== GSTIN_LENGTH) {
        missing.push(`SELLER_GSTIN (must be exactly ${GSTIN_LENGTH} characters)`);
      }

      if (read(env, 'GARMENT_HSN') === undefined) {
        missing.push('GARMENT_HSN (garment HSN code is required)');
      }

      if (read(env, 'SELLER_STATE') === undefined) {
        missing.push('SELLER_STATE (seller state is required for GST breakup)');
      }

      if (read(env, 'LEGAL_ENTITY_NAME') === undefined) {
        missing.push('LEGAL_ENTITY_NAME (legal entity name is required)');
      }

      if (read(env, 'LEGAL_ENTITY_ADDRESS') === undefined) {
        missing.push('LEGAL_ENTITY_ADDRESS (legal entity address is required)');
      }

      // Required AI configuration (Req 12.8).
      if (read(env, 'CLAUDE_MODEL_ID') === undefined) {
        missing.push('CLAUDE_MODEL_ID (Claude model identifier is required)');
      }

      if (missing.length > 0) {
        throw new StartupConfigError(missing);
      }
    },
  };
}

/** Default Config_Service bound to `process.env`. */
export const config: Config_Service = createConfigService();
