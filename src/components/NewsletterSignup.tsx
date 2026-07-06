'use client';

/**
 * NewsletterSignup — footer newsletter form (task 26.1; Req 20.1, 20.5, 20.6).
 *
 * Progressive enhancement: the form posts to the `subscribeNewsletterAction`
 * server action via React's `useActionState`, so it works without client JS and
 * shows an inline confirmation/error state once JS hydrates. The action itself
 * validates the email with Zod and is idempotent, so repeated submissions of an
 * already-subscribed address confirm rather than duplicate (Req 20.6).
 */

import { useActionState } from 'react';

import {
  subscribeNewsletterAction,
  initialNewsletterState,
} from '@/app/newsletter/actions';

export function NewsletterSignup() {
  const [state, formAction, pending] = useActionState(
    subscribeNewsletterAction,
    initialNewsletterState,
  );

  return (
    <div>
      <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-muted">
        Newsletter
      </h2>
      {state.status === 'success' ? (
        <p className="text-sm font-semibold text-success" role="status">
          {state.message}
        </p>
      ) : (
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="source" value="footer" />
          <label htmlFor="newsletter-email" className="sr-only">
            Email address
          </label>
          <input
            id="newsletter-email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="w-full rounded border border-ink/20 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-corporate focus:ring-1 focus:ring-corporate"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center rounded bg-corporate px-4 py-2 text-sm font-bold uppercase tracking-wide text-white hover:bg-ink disabled:opacity-60"
          >
            {pending ? 'Subscribing…' : 'Subscribe'}
          </button>
          {state.status === 'error' && (
            <p className="text-xs font-semibold text-stamp-red" role="alert">
              {state.message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
