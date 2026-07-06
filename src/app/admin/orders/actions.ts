'use server';

/**
 * Admin order server actions. Currently: mark an order shipped with a required
 * tracking id + URL (Req 10.2, 10.9), which records tracking and triggers the
 * shipment notification (Req 18.2, 17.5). Errors surface via redirect query
 * params so the page works without client JS.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/server/admin-auth';
import { markOrderShipped } from '@/server/order-data';

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

export async function markShippedAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const orderId = s(formData, 'orderId');
  const trackingId = s(formData, 'trackingId');
  const trackingUrl = s(formData, 'trackingUrl');

  if (orderId.length === 0) {
    redirect('/admin/orders');
  }

  const result = await markOrderShipped(orderId, trackingId, trackingUrl);
  if (!result.ok) {
    const qs = new URLSearchParams({ error: result.message }).toString();
    redirect(`/admin/orders?${qs}`);
  }

  revalidatePath('/admin/orders');
  redirect('/admin/orders?shipped=1');
}
