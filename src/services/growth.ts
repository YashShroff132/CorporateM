/**
 * Growth_Service — pure growth-loop mechanics (task 26.1; Requirements 20.1–20.7).
 *
 * This module holds the deterministic, dependency-free logic for the four
 * growth loops so each rule can be unit- and property-tested without I/O:
 *
 *   - Newsletter (Req 20.1, 20.5, 20.6): validate/normalize a submitted email
 *     and decide the idempotent subscription outcome (new vs. already-subscribed)
 *     with a confirmation. Persistence lives in `src/server/newsletter-data.ts`.
 *   - Team-pack discount (Req 20.3): apply an Owner_Input discount at/above an
 *     Owner_Input minimum quantity, floored so the resulting total is never
 *     below 0 paise. Always active (not flag-gated).
 *   - Referral (Req 20.2): issue and redeem a unique, single-use discount code
 *     valid for the recipient's first paid order. Guarded by the `referral`
 *     flag at any route/action entry — this module is pure logic only.
 *   - Abandoned-cart (Req 20.4, 20.7): decide whether another reminder may be
 *     sent, bounded by an Owner_Input maximum and cancelled once the cart is
 *     paid or empty. Guarded by the `abandonedCart` flag at any route entry.
 *
 * No scheduler or background job is implemented here (that is explicitly out of
 * scope); these are the pure decisions such a job — or a test — would call.
 *
 * All monetary values are integer paise, delegated to the Money module.
 */

import { z } from 'zod';
import { type Result, ok, err, isErr } from '@/lib/result';
import { type Paise, type MoneyError, makePaise, sub } from '@/lib/money';

// ---------------------------------------------------------------------------
// Newsletter (Req 20.1, 20.5, 20.6)
// ---------------------------------------------------------------------------

/** A syntactically valid email address, normalized to a trimmed lowercase form. */
const newsletterEmailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .max(320, 'Email is too long.')
  .email('Enter a valid email address.');

/** Error returned when a submitted newsletter email is not a valid format (Req 20.5). */
export interface NewsletterInvalidEmail {
  readonly kind: 'INVALID_EMAIL';
  readonly message: string;
}

/**
 * Validate and normalize a submitted newsletter email (Req 20.1, 20.5).
 *
 * Returns the canonical form (trimmed + lowercased) used both for storage and
 * for the uniqueness check that makes subscription idempotent (Req 20.6). An
 * invalid format is rejected without any side effect.
 */
export function normalizeNewsletterEmail(
  email: string,
): Result<string, NewsletterInvalidEmail> {
  const parsed = newsletterEmailSchema.safeParse(email);
  if (!parsed.success) {
    return err({
      kind: 'INVALID_EMAIL',
      message: parsed.error.issues[0]?.message ?? 'Enter a valid email address.',
    });
  }
  return ok(parsed.data.toLowerCase());
}

/** True when the string is a syntactically valid newsletter email. */
export function isValidNewsletterEmail(email: string): boolean {
  return newsletterEmailSchema.safeParse(email).success;
}

/** Outcome of an idempotent newsletter subscribe (Req 20.1, 20.6). */
export type NewsletterOutcome =
  | { readonly status: 'SUBSCRIBED'; readonly email: string; readonly source: string }
  | { readonly status: 'ALREADY_SUBSCRIBED'; readonly email: string };

/**
 * Decide the idempotent subscription outcome for a normalized email given
 * whether it already exists (Req 20.6). This is the pure decision the data
 * layer applies: a first-time email is SUBSCRIBED with its source; an existing
 * email is ALREADY_SUBSCRIBED with no duplicate created. Both are confirmations
 * from the shopper's perspective (Req 20.1, 20.6).
 */
export function decideNewsletterOutcome(
  normalizedEmail: string,
  alreadySubscribed: boolean,
  source: string,
): NewsletterOutcome {
  if (alreadySubscribed) {
    return { status: 'ALREADY_SUBSCRIBED', email: normalizedEmail };
  }
  return { status: 'SUBSCRIBED', email: normalizedEmail, source };
}

// ---------------------------------------------------------------------------
// Team-pack discount (Req 20.3)
// ---------------------------------------------------------------------------

/** Owner_Input configuration for the team-pack discount (Req 20.3). */
export interface TeamPackConfig {
  /** Minimum ordered quantity (inclusive) at which the discount applies. */
  readonly minQuantity: number;
  /** Discount amount in integer paise deducted from the order total. */
  readonly discount: Paise;
}

/** Result of applying the team-pack discount to an order total. */
export interface TeamPackResult {
  /** Whether the quantity qualified for the discount. */
  readonly applied: boolean;
  /** Discount actually deducted (0 when not applied), integer paise. */
  readonly discount: Paise;
  /** Resulting total, floored at 0 paise (Req 20.3). */
  readonly total: Paise;
}

/**
 * Apply the team-pack discount to an order total (Req 20.3).
 *
 * The discount applies only when `quantity` is at or above the configured
 * minimum. The resulting total is floored at 0 paise so a discount larger than
 * the total never produces a negative amount; the reported `discount` is the
 * amount actually removed from the total (never more than the pre-discount
 * total). Pure and non-mutating.
 */
export function applyTeamPackDiscount(
  total: Paise,
  quantity: number,
  config: TeamPackConfig,
): Result<TeamPackResult, MoneyError> {
  const zero = makePaise(0);
  if (isErr(zero)) return zero;

  // Below the minimum quantity the discount does not apply (Req 20.3).
  if (
    !Number.isInteger(quantity) ||
    quantity < config.minQuantity ||
    (config.discount as number) <= 0
  ) {
    return ok({ applied: false, discount: zero.value, total });
  }

  // Deduct, flooring the total at 0 paise so it is never negative (Req 20.3).
  const floored = sub(total, config.discount, { clampAtZero: true });
  if (isErr(floored)) return floored;

  // Effective discount = amount actually removed (caps at the pre-discount total).
  const effective = sub(total, floored.value);
  if (isErr(effective)) return effective;

  return ok({ applied: true, discount: effective.value, total: floored.value });
}

// ---------------------------------------------------------------------------
// Referral (Req 20.2) — behind the `referral` flag at the route boundary
// ---------------------------------------------------------------------------

/** A referral discount code issued to a customer (Req 20.2). */
export interface ReferralCode {
  /** The unique code string. */
  readonly code: string;
  /** Whether the code has already been redeemed (single-use — Req 20.2). */
  readonly redeemed: boolean;
}

/** Why a referral redemption was rejected (Req 20.2). */
export type ReferralRejection =
  | { readonly kind: 'ALREADY_REDEEMED'; readonly message: string }
  | { readonly kind: 'NOT_FIRST_ORDER'; readonly message: string };

/**
 * Generate a unique, single-use referral code from an injected token (Req 20.2).
 *
 * The token supplies uniqueness (e.g. a random id or cuid from the caller) so
 * this function stays pure; the code is uppercased and prefixed for legibility.
 */
export function issueReferralCode(uniqueToken: string): ReferralCode {
  const token = uniqueToken.replace(/[^a-zA-Z0-9]/gu, '').toUpperCase();
  return { code: `REF-${token}`, redeemed: false };
}

/**
 * Decide whether a referral code may be redeemed for a recipient's order
 * (Req 20.2). A code is valid only when it has not already been redeemed
 * (single-use) and the redeeming order is the recipient's first paid order.
 * Pure decision; the caller performs the atomic mark-redeemed persistence.
 */
export function redeemReferralCode(
  code: ReferralCode,
  isRecipientFirstPaidOrder: boolean,
): Result<ReferralCode, ReferralRejection> {
  if (code.redeemed) {
    return err({
      kind: 'ALREADY_REDEEMED',
      message: `Referral code ${code.code} has already been used.`,
    });
  }
  if (!isRecipientFirstPaidOrder) {
    return err({
      kind: 'NOT_FIRST_ORDER',
      message: `Referral code ${code.code} is only valid on the recipient's first paid order.`,
    });
  }
  return ok({ ...code, redeemed: true });
}

// ---------------------------------------------------------------------------
// Abandoned-cart reminders (Req 20.4, 20.7) — behind the `abandonedCart` flag
// ---------------------------------------------------------------------------

/** The state of a cart relevant to abandoned-cart reminders (Req 20.4, 20.7). */
export interface AbandonedCartState {
  /** Whether a contact (email/phone) has been captured for the cart. */
  readonly hasContact: boolean;
  /** Whether the cart has been paid (an order completed). */
  readonly paid: boolean;
  /** Whether the cart currently has zero items. */
  readonly empty: boolean;
  /** Number of reminders already sent for this cart. */
  readonly remindersSent: number;
  /** Milliseconds since the cart was last updated (unpaid dwell time). */
  readonly msSinceLastUpdate: number;
}

/** Owner_Input configuration for abandoned-cart reminders (Req 20.4). */
export interface AbandonedCartConfig {
  /** Interval (ms) a cart must remain unpaid before a reminder is due. */
  readonly intervalMs: number;
  /** Maximum number of reminders to send for a cart (Req 20.4). */
  readonly maxReminders: number;
}

/**
 * Decide whether another abandoned-cart reminder should be sent (Req 20.4, 20.7).
 *
 * Returns true only when: a contact was captured, the cart is neither paid nor
 * empty (Req 20.7 cancels further reminders in those cases), the configured
 * dwell interval has elapsed, and fewer than the maximum reminders have been
 * sent (Req 20.4). Pure decision — the scheduler/job that would call this is
 * intentionally not built.
 */
export function shouldSendAbandonedCartReminder(
  state: AbandonedCartState,
  config: AbandonedCartConfig,
): boolean {
  if (!state.hasContact) return false;
  // A paid or emptied cart cancels any further reminders (Req 20.7).
  if (state.paid || state.empty) return false;
  if (config.maxReminders <= 0) return false;
  if (state.remindersSent >= config.maxReminders) return false;
  if (state.msSinceLastUpdate < config.intervalMs) return false;
  return true;
}

/**
 * Whether all pending abandoned-cart reminders for a cart must be cancelled
 * (Req 20.7): true once the cart becomes paid or empty.
 */
export function shouldCancelAbandonedCartReminders(
  state: Pick<AbandonedCartState, 'paid' | 'empty'>,
): boolean {
  return state.paid || state.empty;
}
