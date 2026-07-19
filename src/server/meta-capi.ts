import crypto from 'crypto';

/**
 * Meta Conversions API (CAPI) Server-Side Event Dispatcher.
 *
 * Sends server-side purchase and checkout events directly to Meta's Graph API
 * (https://graph.facebook.com/v19.0/{pixel_id}/events).
 *
 * Fully non-blocking and exception-safe: uses native fetch with sha256 user data hashing
 * (email, phone) for maximum Event Match Quality (EMQ). Uses `event_id` (Order ID)
 * to allow Meta to seamlessly deduplicate against client-side Meta Pixel events.
 */

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data.trim().toLowerCase()).digest('hex');
}

export interface MetaCapiPurchasePayload {
  readonly orderId: string;
  readonly amountPaise: number;
  readonly email?: string;
  readonly phone?: string;
}

export async function sendMetaCapiPurchase(payload: MetaCapiPurchasePayload): Promise<void> {
  const pixelId = (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '').trim();
  const accessToken = (process.env.META_CAPI_ACCESS_TOKEN ?? '').trim();

  // Graceful degradation: if CAPI access token or Pixel ID is absent, no-op.
  if (pixelId.length === 0 || accessToken.length === 0) {
    return;
  }

  try {
    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`;
    const eventTime = Math.floor(Date.now() / 1000);
    const amountInr = (payload.amountPaise / 100).toFixed(2);

    const userData: Record<string, string> = {};
    if (payload.email && payload.email.trim().length > 0) {
      userData.em = sha256(payload.email);
    }
    if (payload.phone && payload.phone.trim().length > 0) {
      // Clean phone number (strip non-digits)
      const digits = payload.phone.replace(/\D/g, '');
      userData.ph = sha256(digits.startsWith('91') ? digits : `91${digits}`);
    }

    const eventData = {
      data: [
        {
          event_name: 'Purchase',
          event_time: eventTime,
          event_id: payload.orderId, // Used by Meta for automatic deduplication with Meta Pixel
          action_source: 'website',
          event_source_url: 'https://oofo.tech/checkout',
          user_data: userData,
          custom_data: {
            currency: 'INR',
            value: amountInr,
            order_id: payload.orderId,
          },
        },
      ],
    };

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    }).catch(() => {
      // Fire-and-forget: swallow network errors so order processing is never delayed
    });
  } catch {
    // Swallow any initialization errors
  }
}
