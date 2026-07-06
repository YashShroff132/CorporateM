/**
 * Newsletter data-access layer (task 26.1; Req 20.1, 20.5, 20.6).
 *
 * Bridges the pure {@link normalizeNewsletterEmail} / {@link decideNewsletterOutcome}
 * growth logic to the persisted NewsletterSub rows. Subscription is idempotent:
 * a repeat of an already-subscribed email creates no duplicate and reports a
 * confirmation (Req 20.6); an invalid email is rejected (Req 20.5).
 *
 * Uses a Prisma `upsert` keyed on the unique `email` column so concurrent or
 * repeated submissions never create duplicates. Degrades gracefully: with no DB
 * the subscribe returns an unavailable result instead of throwing.
 */

import {
  normalizeNewsletterEmail,
  type NewsletterOutcome,
} from '@/services/growth';

/** Outcome of an attempted newsletter subscription. */
export type SubscribeResult =
  | { readonly ok: true; readonly outcome: NewsletterOutcome }
  | { readonly ok: false; readonly kind: 'INVALID_EMAIL'; readonly message: string }
  | { readonly ok: false; readonly kind: 'UNAVAILABLE'; readonly message: string };

/**
 * Subscribe an email to the newsletter, recording its source (Req 20.1). The
 * email is validated/normalized first (Req 20.5); duplicates are avoided via an
 * upsert on the unique email column (Req 20.6). Returns whether the address was
 * newly subscribed or already subscribed — both are shopper confirmations.
 */
export async function subscribeToNewsletter(
  email: string,
  source: string,
): Promise<SubscribeResult> {
  const normalized = normalizeNewsletterEmail(email);
  if (!normalized.ok) {
    return { ok: false, kind: 'INVALID_EMAIL', message: normalized.error.message };
  }
  const normalizedEmail = normalized.value;

  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();

    const existing = await prisma.newsletterSub.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existing !== null) {
      // Already subscribed — no duplicate created (Req 20.6).
      return {
        ok: true,
        outcome: { status: 'ALREADY_SUBSCRIBED', email: normalizedEmail },
      };
    }

    // Idempotent create: upsert guards against a race where the row appears
    // between the check above and the write (unique email column, Req 20.6).
    await prisma.newsletterSub.upsert({
      where: { email: normalizedEmail },
      update: {},
      create: { email: normalizedEmail, source },
    });

    return {
      ok: true,
      outcome: { status: 'SUBSCRIBED', email: normalizedEmail, source },
    };
  } catch {
    return {
      ok: false,
      kind: 'UNAVAILABLE',
      message: 'Subscription service is temporarily unavailable. Please try again later.',
    };
  }
}
