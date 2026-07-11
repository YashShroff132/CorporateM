/**
 * Narrative act content for the signature scroll homepage (Requirement 4.1).
 *
 * The acts are declared here as plain data in the fixed narrative order:
 *   hook -> university -> descent -> corporate reality -> rebellion -> footer CTA.
 *
 * Keeping the content as data (rather than inline JSX) guarantees a single,
 * server-renderable source of truth that works with JavaScript disabled
 * (Req 4.3) and lets the fixed ordering be asserted in tests.
 */

/** Stable identifier for each narrative act, in fixed order. */
export type NarrativeActId =
  | 'hook'
  | 'university'
  | 'descent'
  | 'corporate-reality'
  | 'rebellion'
  | 'footer-cta';

export interface NarrativeAct {
  /** Stable id used for anchors and animation targeting. */
  id: NarrativeActId;
  /** Small eyebrow label above the headline. */
  kicker: string;
  /** The act headline. */
  title: string;
  /** One or more readable paragraphs of body copy. */
  body: string[];
  /** Optional call-to-action link rendered as a standard anchor (works no-JS). */
  cta?: { label: string; href: string };
}

/**
 * The narrative acts in their required fixed order (Req 4.1). Do not reorder;
 * the homepage renders them in array order and tests assert this sequence.
 */
export const NARRATIVE_ACTS: readonly NarrativeAct[] = [
  {
    id: 'hook',
    kicker: 'Out of Office',
    title: 'Currently unavailable and permanently out of office.',
    body: [
      'You did everything right. The degree, the internships, the LinkedIn optimism. Then you met the calendar invite that could have been an email.',
    ],
    cta: { label: 'Shop the collection', href: '/shop' },
  },
  {
    id: 'university',
    kicker: 'Act I — University',
    title: 'They told you the world was yours.',
    body: [
      'Late-night ideas. Group projects that almost worked. A syllabus that promised the future rewards passion and hustle.',
      'You believed it. Honestly, so did we.',
    ],
  },
  {
    id: 'descent',
    kicker: 'Act II — The Descent',
    title: 'Then onboarding happened.',
    body: [
      'Seventeen tabs. Four approvals. A mandatory training on the training you already did.',
      'Somewhere between "quick sync" and "circle back", the optimism started buffering.',
    ],
  },
  {
    id: 'corporate-reality',
    kicker: 'Act III — Corporate Reality',
    title: 'Welcome to the open floor plan.',
    body: [
      'Reply-all threads with no reply needed. Status updates about updating the status. A stand-up that never sits down.',
      'This is the reality our shirts translate into something you can actually wear.',
    ],
    cta: { label: 'Browse by bravery tier', href: '/shop' },
  },
  {
    id: 'rebellion',
    kicker: 'Act IV — Rebellion',
    title: 'Say the quiet part out loud.',
    body: [
      'From "Safe for Standup" to "Notice Period Energy", pick how boldly you broadcast the truth.',
      'Corporate suffering, turned into wearable protest.',
    ],
    cta: { label: 'Find your tier', href: '/shop' },
  },
  {
    id: 'footer-cta',
    kicker: 'Go OOO',
    title: 'Clock out. Dress up. Speak freely.',
    body: [
      'Every shirt is fully shoppable — no animation, no JavaScript, no meeting required.',
    ],
    cta: { label: 'Enter the shop', href: '/shop' },
  },
] as const;
