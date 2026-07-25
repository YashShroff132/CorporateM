'use client';

/**
 * NewsletterSignup — footer newsletter form component.
 * Uses client-side fetch to /api/newsletter/subscribe for fast, smooth inline feedback
 * without page reloads or error page crashes.
 *
 * Fully styled for both light mode and dark mode with high-contrast text.
 */

import { useState, type FormEvent } from 'react';

export function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: 'footer' }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setStatus('success');
        setMessage(data.message || "You're subscribed! Watch your inbox.");
        setEmail('');
      } else {
        setStatus('error');
        setMessage(data.message || 'Subscription failed. Please try again.');
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  return (
    <div>
      <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-muted">
        Newsletter
      </h2>
      {status === 'success' ? (
        <p className="text-sm font-bold text-success" role="status">
          {message}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <label htmlFor="newsletter-email" className="sr-only">
            Email address
          </label>
          <input
            id="newsletter-email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded border border-ink/20 dark:border-white/20 bg-white dark:bg-black px-3 py-2 text-sm text-black dark:text-white placeholder:text-muted outline-none focus:border-stamp-red focus:ring-1 focus:ring-stamp-red"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="inline-flex items-center justify-center rounded bg-corporate px-4 py-2 text-sm font-bold uppercase tracking-wide text-white hover:bg-stamp-red dark:hover:bg-stamp-red transition-colors disabled:opacity-60"
          >
            {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
          </button>
          {status === 'error' && (
            <p className="text-xs font-semibold text-stamp-red" role="alert">
              {message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
