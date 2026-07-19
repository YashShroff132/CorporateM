import { NextResponse } from 'next/server';
import { markOrderShipped } from '@/server/order-data';

export const dynamic = 'force-dynamic';

/**
 * POST /api/fulfillment/qikink/webhook
 *
 * Webhook endpoint for Qikink integration. When Qikink updates an order
 * to 'shipped' or 'dispatched', this webhook:
 *   1. Authenticates the request (if QIKINK_WEBHOOK_TOKEN is set in env).
 *   2. Extracts the order_id, AWB tracking number, and carrier.
 *   3. Triggers the order state transition to SHIPPED.
 *   4. Automatically fires the shipment confirmation email to the customer.
 */
interface QikinkPayload {
  readonly order_id?: string;
  readonly orderId?: string;
  readonly receipt?: string;
  readonly status?: string;
  readonly awb?: string;
  readonly awb_number?: string;
  readonly tracking_number?: string;
  readonly trackingId?: string;
  readonly carrier?: string;
  readonly shipping_partner?: string;
  readonly tracking_url?: string;
  readonly tracking_link?: string;
  readonly trackingUrl?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const webhookToken = (process.env.QIKINK_WEBHOOK_TOKEN ?? '').trim();
  if (webhookToken.length > 0) {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get('token');
    const headerToken = request.headers.get('x-qikink-token');
    if (queryToken !== webhookToken && headerToken !== webhookToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: QikinkPayload;
  try {
    body = (await request.json()) as QikinkPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const orderId = body.order_id || body.orderId || body.receipt;
  const status = typeof body.status === 'string' ? body.status.toLowerCase() : '';
  const trackingId = body.awb || body.awb_number || body.tracking_number || body.trackingId;
  const carrier = body.carrier || body.shipping_partner || 'Delhivery';
  let trackingUrl = body.tracking_url || body.tracking_link || body.trackingUrl;

  if (!orderId) {
    return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });
  }

  const isShipped = status === 'shipped' || status === 'dispatched' || status === 'delivered';

  if (isShipped && trackingId) {
    // Generate tracking URL if Qikink doesn't provide one
    if (!trackingUrl) {
      if (carrier.toLowerCase().includes('delhivery')) {
        trackingUrl = `https://www.delhivery.com/track/package/${trackingId}`;
      } else {
        trackingUrl = `https://track.quickink.in/${trackingId}`;
      }
    }

    const result = await markOrderShipped(orderId, trackingId, trackingUrl);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: 'Order marked as shipped.' });
  }

  return NextResponse.json({ ok: true, message: `Ignored status: ${status}` });
}
