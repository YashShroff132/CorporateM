/**
 * Moderation_Gate — the automated content-policy enforcement component of the
 * AI_Engine (Requirement 13).
 *
 * Every AI-generated candidate slogan crosses this gate *before* it can enter
 * the Review_Queue. The gate:
 * - evaluates each candidate against the content policy (Req 13.1)
 * - AUTO_REJECTs prohibited-category content (hate/slurs/protected-class,
 *   real-entity naming/defamation, sexual/harassment/threats/self-harm/
 *   illegal-activity) and any candidate whose policy-violation confidence score
 *   is at or above the Owner_Input auto-reject threshold (Req 13.2, 13.3, 13.4)
 * - routes to human review (NEEDS_REVIEW) any candidate whose score falls in the
 *   review band `[review, autoReject)`, or whose tier is VERY_DIRECT regardless
 *   of the automated outcome (Req 13.5, 13.6)
 * - ADMITs to the Review_Queue any remaining candidate (Req 13.10)
 * - NEVER publishes a slogan: publication always requires a separate human
 *   approval action (Req 13.8)
 * - records every decision (slogan, outcome, reason) to the audit log (Req 13.7,
 *   13.9)
 * - withholds a candidate from the Review_Queue, prevents publication, and
 *   records the failure when evaluation does not complete within 30 seconds or
 *   otherwise fails (Req 13.11)
 *
 * The routing decision is a **pure function** ({@link route}) over the tier, the
 * analyzer's findings, and the moderation thresholds, so it can be exhaustively
 * property-tested (design Property 49/50). The 30-second timeout, the external
 * analyzer call, and audit persistence are isolated in {@link evaluate}, which
 * accepts injected dependencies and never itself publishes.
 *
 * Thresholds are read from `Config_Service.moderationThresholds()`, which
 * guarantees `0 <= review < autoReject <= 1` (Req 22).
 */

import type { Tier } from './catalog';
import type { ModerationThresholds } from './config';

// ---------------------------------------------------------------------------
// Outcomes and dispositions
// ---------------------------------------------------------------------------

/**
 * The three routing outcomes a *completed* evaluation can produce, plus the
 * WITHHELD disposition used when evaluation times out or fails (Req 13.11).
 *
 * Crucially there is no "PUBLISH" member: the gate can never publish (Req 13.8).
 */
export type ModStatus = 'AUTO_REJECT' | 'NEEDS_REVIEW' | 'ADMIT' | 'WITHHELD';

/**
 * The three outcomes produced by the pure {@link route} function once an
 * evaluation has completed. WITHHELD is reserved for the timeout/failure path
 * handled by {@link evaluate}.
 */
export type ModOutcome = Extract<ModStatus, 'AUTO_REJECT' | 'NEEDS_REVIEW' | 'ADMIT'>;

/**
 * Prohibited content categories. Any detected category forces an AUTO_REJECT
 * regardless of the numeric score (Req 13.2, 13.3, 13.4).
 */
export type ProhibitedCategory =
  | 'HATE_SLUR_PROTECTED_CLASS' // Req 13.2
  | 'REAL_ENTITY_DEFAMATION' // Req 13.3
  | 'SEXUAL' // Req 13.4
  | 'HARASSMENT' // Req 13.4
  | 'THREATS' // Req 13.4
  | 'SELF_HARM' // Req 13.4
  | 'ILLEGAL_ACTIVITY'; // Req 13.4

export const PROHIBITED_CATEGORIES: readonly ProhibitedCategory[] = [
  'HATE_SLUR_PROTECTED_CLASS',
  'REAL_ENTITY_DEFAMATION',
  'SEXUAL',
  'HARASSMENT',
  'THREATS',
  'SELF_HARM',
  'ILLEGAL_ACTIVITY',
];

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A candidate slogan awaiting moderation. */
export interface ModerationCandidate {
  readonly slogan: string;
  readonly tier: Tier;
}

/**
 * The findings produced by the content-policy analyzer for a single candidate.
 * `score` is the policy-violation confidence in `[0, 1]`; `categories` lists any
 * prohibited categories the analyzer detected.
 */
export interface ModerationAnalysis {
  readonly score: number;
  readonly categories: readonly ProhibitedCategory[];
}

/**
 * An asynchronous content-policy analyzer (e.g. a Claude/moderation API call).
 * Isolated behind this interface so the routing logic stays pure and the
 * external effect can be mocked and time-bounded.
 */
export type ModerationAnalyzer = (
  candidate: ModerationCandidate,
) => Promise<ModerationAnalysis>;

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

/**
 * The outcome of moderating a candidate.
 *
 * `entersReviewQueue` is true only for NEEDS_REVIEW and ADMIT; AUTO_REJECT
 * excludes (Req 13.9) and WITHHELD withholds (Req 13.11). `published` is a
 * literal `false` — the gate never publishes (Req 13.8).
 */
export interface ModDecision {
  readonly status: ModStatus;
  readonly reasons: readonly string[];
  readonly entersReviewQueue: boolean;
  readonly published: false;
}

// ---------------------------------------------------------------------------
// Audit logging (Req 13.7)
// ---------------------------------------------------------------------------

/** An immutable record of a single moderation decision written to the audit log. */
export interface ModerationAuditEntry {
  readonly slogan: string;
  readonly tier: Tier;
  readonly status: ModStatus;
  readonly reasons: readonly string[];
  /** The analyzer score, or `null` when evaluation failed before producing one. */
  readonly score: number | null;
  readonly timestamp: Date;
}

/** Sink that persists a moderation decision to the immutable audit log. */
export type ModerationAuditRecorder = (
  entry: ModerationAuditEntry,
) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum time the gate waits for evaluation to complete (Req 13.11). */
export const MODERATION_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Pure routing core (design Property 49)
// ---------------------------------------------------------------------------

/**
 * Route a *completed* evaluation to exactly one of AUTO_REJECT, NEEDS_REVIEW, or
 * ADMIT. Pure and total over its inputs.
 *
 * Precedence (mirroring the design contract):
 *   1. any prohibited category OR `score >= autoReject`            -> AUTO_REJECT
 *   2. `review <= score < autoReject` OR tier === 'VERY_DIRECT'    -> NEEDS_REVIEW
 *   3. otherwise                                                   -> ADMIT
 *
 * AUTO_REJECT takes precedence over the VERY_DIRECT review rule so prohibited
 * content is never routed into the queue for a human to publish (Req 13.2–13.4,
 * 13.6). The result never publishes (Req 13.8).
 */
export function route(
  tier: Tier,
  analysis: ModerationAnalysis,
  thresholds: ModerationThresholds,
): ModDecision {
  const reasons: string[] = [];

  const hasProhibitedCategory = analysis.categories.length > 0;
  const atOrAboveAutoReject = analysis.score >= thresholds.autoReject;

  // 1. AUTO_REJECT — prohibited category or score at/above the auto-reject bar.
  if (hasProhibitedCategory || atOrAboveAutoReject) {
    for (const category of analysis.categories) {
      reasons.push(`prohibited-category:${category}`);
    }
    if (atOrAboveAutoReject) {
      reasons.push(
        `score-at-or-above-auto-reject:${analysis.score}>=${thresholds.autoReject}`,
      );
    }
    return {
      status: 'AUTO_REJECT',
      reasons,
      entersReviewQueue: false,
      published: false,
    };
  }

  // 2. NEEDS_REVIEW — score in the review band, or a VERY_DIRECT tier.
  const inReviewBand =
    analysis.score >= thresholds.review && analysis.score < thresholds.autoReject;
  if (inReviewBand) {
    reasons.push(
      `score-in-review-band:${thresholds.review}<=${analysis.score}<${thresholds.autoReject}`,
    );
  }
  if (tier === 'VERY_DIRECT') {
    reasons.push('tier:VERY_DIRECT');
  }
  if (inReviewBand || tier === 'VERY_DIRECT') {
    return {
      status: 'NEEDS_REVIEW',
      reasons,
      entersReviewQueue: true,
      published: false,
    };
  }

  // 3. ADMIT — clean candidate below the review threshold.
  return {
    status: 'ADMIT',
    reasons: ['below-review-threshold'],
    entersReviewQueue: true,
    published: false,
  };
}

// ---------------------------------------------------------------------------
// Evaluation wrapper: timeout + audit (Req 13.1, 13.7, 13.9, 13.11)
// ---------------------------------------------------------------------------

/** Dependencies injected into {@link evaluate}. */
export interface EvaluateDeps {
  /** The external content-policy analyzer (mocked in tests). */
  readonly analyze: ModerationAnalyzer;
  /** Sink for the immutable audit log (Req 13.7). */
  readonly record: ModerationAuditRecorder;
  /** Evaluation deadline in milliseconds; defaults to {@link MODERATION_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
  /** Clock, injectable for deterministic tests. */
  readonly now?: () => Date;
}

/** A decision returned when evaluation times out or fails (Req 13.11). */
function withheldDecision(reason: string): ModDecision {
  return {
    status: 'WITHHELD',
    reasons: [reason],
    entersReviewQueue: false,
    published: false,
  };
}

/** Reject with a timeout marker if `promise` does not settle within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`moderation-timeout:${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Evaluate a single candidate against the content policy and route it.
 *
 * On success the pure {@link route} decision is returned and recorded. If the
 * analyzer does not complete within the timeout (default 30 s) or throws, the
 * candidate is WITHHELD from the Review_Queue, publication is prevented, and the
 * failure is recorded (Req 13.11). Every path records exactly one audit entry
 * (Req 13.7, 13.9) and never publishes (Req 13.8).
 */
export async function evaluate(
  candidate: ModerationCandidate,
  thresholds: ModerationThresholds,
  deps: EvaluateDeps,
): Promise<ModDecision> {
  const timeoutMs = deps.timeoutMs ?? MODERATION_TIMEOUT_MS;
  const now = deps.now ?? (() => new Date());

  let decision: ModDecision;
  let score: number | null = null;

  try {
    const analysis = await withTimeout(deps.analyze(candidate), timeoutMs);
    score = analysis.score;
    decision = route(candidate.tier, analysis, thresholds);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    decision = withheldDecision(
      message.startsWith('moderation-timeout')
        ? 'evaluation-timeout'
        : `evaluation-failure:${message}`,
    );
  }

  await deps.record({
    slogan: candidate.slogan,
    tier: candidate.tier,
    status: decision.status,
    reasons: decision.reasons,
    score,
    timestamp: now(),
  });

  return decision;
}
