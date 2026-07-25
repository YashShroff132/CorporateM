'use server';

/**
 * Newsletter signup server action (task 26.1; Req 20.1, 20.5, 20.6).
 *
 * Validates the submitted email with Zod (via the pure growth service),
 * subscribes idempotently through the data layer, and returns a form state the
 * footer component renders as a confirmation or error. Works without client JS
 * via React's form-action state, and progressively enhances when JS is present.
 */

import { subscribeToNewsletter } from '@/server/newsletter-data';

/** State returned to the newsletter form after a submission attempt. */
export interface NewsletterFormState {
  readonly status: 'idle' | 'success' | 'error';
  readonly message: string;
}

/** Initial (unsubmitted) form state. */
export const initialNewsletterState: NewsletterFormState = {
  status: 'idle',
  message: '',
};

export async function subscribeNewsletterAction(
  _prev: NewsletterFormState,
  formData: FormData,
): Promise<NewsletterFormState> {
  try {
    const raw = formData.get('email');
    const email = typeof raw === 'string' ? raw : '';
    const source =
      typeof formData.get('source') === 'string'
        ? (formData.get('source') as string)
        : 'footer';

    if (!email || !email.includes('@')) {
      return { status: 'error', message: 'Please enter a valid email address.' };
    }

    const result = await subscribeToNewsletter(email, source);

    if (!result.ok) {
      return {
        status: 'error',
        message: result.message || 'Subscription service is temporarily unavailable. Please try again.',
      };
    }

    // Both new and already-subscribed are confirmations (Req 20.1, 20.6).
    const message =
      result.outcome.status === 'ALREADY_SUBSCRIBED'
        ? "You're already subscribed. Thanks for being with us."
        : "You're subscribed! Watch your inbox.";
    return { status: 'success', message };
  } catch (error) {
    console.error('Newsletter subscription action error:', error);
    return {
      status: 'error',
      message: 'Unable to process subscription right now. Please try again.',
    };
  }
}
