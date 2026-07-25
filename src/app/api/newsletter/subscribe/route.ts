/**
 * POST /api/newsletter/subscribe — API route for newsletter subscriptions.
 * Returns JSON response { ok: boolean, message: string } without page reload or 500 crashes.
 */

import { NextResponse } from 'next/server';
import { subscribeToNewsletter } from '@/server/newsletter-data';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const source = typeof body.source === 'string' ? body.source.trim() : 'footer';

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { ok: false, message: 'Please enter a valid email address.' },
        { status: 400 },
      );
    }

    const result = await subscribeToNewsletter(email, source);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message || 'Subscription service is temporarily unavailable.' },
        { status: 400 },
      );
    }

    const message =
      result.outcome.status === 'ALREADY_SUBSCRIBED'
        ? "You're already subscribed. Thanks for being with us!"
        : "You're subscribed! Watch your inbox for updates.";

    return NextResponse.json({ ok: true, message });
  } catch (error) {
    console.error('API newsletter subscription error:', error);
    return NextResponse.json(
      { ok: false, message: 'Unable to process subscription right now. Please try again.' },
      { status: 500 },
    );
  }
}
