import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ALL_FLAGS,
  StartupConfigError,
  createConfigService,
  type Flag,
} from './config';

/**
 * Property tests for Config_Service startup validation and feature flags.
 *
 * The Config_Service is created via the createConfigService(env) factory so a
 * synthetic environment can be injected (rather than mutating process.env).
 */

/** The exact set of required environment keys enforced by validateStartup(). */
const REQUIRED_KEYS = [
  'BRAND_NAME',
  'BRAND_LOGO_URL',
  'BRAND_COLOR_TOKENS',
  'GST_RATE_PERCENT',
  'SELLER_GSTIN',
  'GARMENT_HSN',
  'SELLER_STATE',
  'LEGAL_ENTITY_NAME',
  'LEGAL_ENTITY_ADDRESS',
  'CLAUDE_MODEL_ID',
] as const;

type RequiredKey = (typeof REQUIRED_KEYS)[number];

/** Build a fully-valid environment satisfying every required field. */
function validEnv(): Record<string, string> {
  return {
    BRAND_NAME: 'Out of Office',
    BRAND_LOGO_URL: 'https://cdn.example.com/logo.svg',
    BRAND_COLOR_TOKENS: JSON.stringify({ primary: '#101010', accent: '#ff0055' }),
    GST_RATE_PERCENT: '5',
    SELLER_GSTIN: '29ABCDE1234F1Z5', // exactly 15 chars
    GARMENT_HSN: '6109',
    SELLER_STATE: 'Karnataka',
    LEGAL_ENTITY_NAME: 'Out of Office Retail Pvt Ltd',
    LEGAL_ENTITY_ADDRESS: 'No. 1, MG Road, Bengaluru, Karnataka 560001',
    CLAUDE_MODEL_ID: 'claude-3-5-sonnet',
  };
}

describe('Config_Service.validateStartup — Property 76', () => {
  // Feature: corporate-cult-ecommerce, Property 76: For any brand configuration missing a required field, startup fails with an error that identifies the missing configuration.
  it('fails fast identifying the missing required config field(s)', () => {
    fc.assert(
      fc.property(
        // Pick a non-empty subset of required keys to remove from a valid env.
        fc
          .subarray(REQUIRED_KEYS as unknown as RequiredKey[], { minLength: 1 })
          .map((keys) => [...new Set(keys)]),
        (missingKeys) => {
          const env = validEnv();
          for (const key of missingKeys) {
            delete env[key];
          }

          const svc = createConfigService(env);

          let thrown: unknown;
          try {
            svc.validateStartup();
          } catch (e) {
            thrown = e;
          }

          // Startup must fail.
          expect(thrown).toBeInstanceOf(StartupConfigError);
          const err = thrown as StartupConfigError;

          // The error must identify every missing required field by name.
          for (const key of missingKeys) {
            expect(err.missing.some((m) => m.includes(key))).toBe(true);
            expect(err.message).toContain(key);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: corporate-cult-ecommerce, Property 76: For any brand configuration missing a required field, startup fails with an error that identifies the missing configuration.
  it('succeeds when all required configuration is present', () => {
    fc.assert(
      fc.property(
        // Optional/extra env vars must not cause startup to fail.
        fc.dictionary(
          fc.constantFrom('LOW_STOCK_THRESHOLD', 'CROSS_SELL_COUNT', 'STORE_TIMEZONE'),
          fc.string(),
        ),
        (extra) => {
          const env = { ...validEnv(), ...extra };
          const svc = createConfigService(env);
          expect(() => svc.validateStartup()).not.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Config_Service feature flags default disabled (Req 22.2)', () => {
  it('every known flag is disabled when its env var is absent', () => {
    const svc = createConfigService({});
    for (const flag of ALL_FLAGS) {
      expect(svc.isEnabled(flag)).toBe(false);
    }
  });

  it('enables a flag only for recognized truthy tokens', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Flag>(...(ALL_FLAGS as Flag[])),
        fc.constantFrom('true', '1', 'yes', 'on', 'TRUE', 'On'),
        (flag, truthy) => {
          const env: Record<string, string> = { [flagEnvKey(flag)]: truthy };
          const svc = createConfigService(env);
          expect(svc.isEnabled(flag)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/** Mirror of the internal FLAG_ENV mapping for test-side env construction. */
function flagEnvKey(flag: Flag): string {
  const map: Record<Flag, string> = {
    aiStudio: 'FLAG_AI_STUDIO',
    reviews: 'FLAG_REVIEWS',
    homepage3D: 'FLAG_HOMEPAGE_3D',
    pod: 'FLAG_POD',
    shippingAggregator: 'FLAG_SHIPPING_AGGREGATOR',
    whatsapp: 'FLAG_WHATSAPP',
    referral: 'FLAG_REFERRAL',
    abandonedCart: 'FLAG_ABANDONED_CART',
  };
  return map[flag];
}
