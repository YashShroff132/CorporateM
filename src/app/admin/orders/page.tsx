/**
 * /admin/orders — list orders with status + inclusive creation-date-range
 * filters (Req 10.5), a CSV export link for the filtered set (Req 10.6), and a
 * per-order "mark shipped" action that records a tracking id + URL and triggers
 * the shipment email (Req 10.2, 18.2). Degrades to a notice without a DB.
 */

import { requireAdmin } from '@/server/admin-auth';
import {
  listOrdersForAdmin,
  ORDER_STATUS_VALUES,
  type AdminOrderFilter,
} from '@/server/order-data';
import type { OrderStatus } from '@/services/order';
import {
  AdminShell,
  Field,
  Notice,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../ui';
import { markShippedAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  CREATED: 'bg-muted/15 text-muted',
  PAID: 'bg-success/15 text-success',
  FULFILLING: 'bg-highlighter/40 text-ink',
  SHIPPED: 'bg-corporate/15 text-corporate',
  DELIVERED: 'bg-success/15 text-success',
  CANCELLED: 'bg-ink/10 text-ink',
  REFUNDED: 'bg-stamp-red/10 text-stamp-red',
};

function formatInr(paise: number): string {
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
}

interface PageProps {
  searchParams: Promise<{
    status?: string;
    from?: string;
    to?: string;
    error?: string;
    shipped?: string;
  }>;
}

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  await requireAdmin();
  const params = await searchParams;

  const status =
    params.status !== undefined &&
    ORDER_STATUS_VALUES.includes(params.status as OrderStatus)
      ? (params.status as OrderStatus)
      : undefined;
  const from =
    params.from !== undefined && params.from.length > 0 ? params.from : undefined;
  const to = params.to !== undefined && params.to.length > 0 ? params.to : undefined;

  const filter: AdminOrderFilter = {
    status,
    from: from !== undefined ? new Date(`${from}T00:00:00.000`) : undefined,
    to: to !== undefined ? new Date(`${to}T23:59:59.999`) : undefined,
  };
  const orders = await listOrdersForAdmin(filter);

  const exportQuery = new URLSearchParams();
  if (status !== undefined) exportQuery.set('status', status);
  if (from !== undefined) exportQuery.set('from', from);
  if (to !== undefined) exportQuery.set('to', to);
  const exportHref = `/admin/orders/export?${exportQuery.toString()}`;

  return (
    <AdminShell
      title="Orders"
      actions={
        <a href={exportHref} className={secondaryButtonClass}>
          Export CSV
        </a>
      }
    >
      {params.error !== undefined && (
        <div className="mb-4">
          <Notice kind="error">{params.error}</Notice>
        </div>
      )}
      {params.shipped === '1' && (
        <div className="mb-4">
          <Notice kind="success">Order marked shipped and notification queued.</Notice>
        </div>
      )}

      <form
        method="get"
        className="mb-6 grid grid-cols-1 gap-4 rounded border border-ink/10 bg-white p-4 sm:grid-cols-4"
      >
        <Field label="Status" htmlFor="status">
          <select id="status" name="status" defaultValue={status ?? ''} className={inputClass}>
            <option value="">All</option>
            {ORDER_STATUS_VALUES.map((sv) => (
              <option key={sv} value={sv}>
                {sv}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From" htmlFor="from">
          <input id="from" name="from" type="date" defaultValue={from ?? ''} className={inputClass} />
        </Field>
        <Field label="To" htmlFor="to">
          <input id="to" name="to" type="date" defaultValue={to ?? ''} className={inputClass} />
        </Field>
        <div className="flex items-end">
          <button type="submit" className={primaryButtonClass}>
            Filter
          </button>
        </div>
      </form>

      {orders.length === 0 ? (
        <Notice>No orders match the current filter (or the database is not connected).</Notice>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-100 text-xs font-bold uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Razorpay Payment ID</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Total (₹)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Mark shipped</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-900">
              {orders.map((o) => {
                const canShip = o.status === 'PAID' || o.status === 'FULFILLING';
                return (
                  <tr key={o.id} className="align-top hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                      {o.id}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {o.razorpayPaymentId ? (
                        <div className="font-bold text-blue-700">{o.razorpayPaymentId}</div>
                      ) : (
                        <div className="text-slate-400 font-normal">Pending payment</div>
                      )}
                      {o.razorpayOrderId && (
                        <div className="text-[10px] text-slate-500 mt-0.5">{o.razorpayOrderId}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {o.createdAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{o.email ?? '—'}</div>
                      <div className="text-xs text-slate-500">{o.phone ?? ''}</div>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      ₹{formatInr(o.total)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[o.status] ?? 'bg-slate-100 text-slate-800'}`}
                      >
                        {o.status}
                      </span>
                      {o.trackingId !== null && (
                        <div className="mt-1 text-xs text-slate-500">Tracking: {o.trackingId}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canShip ? (
                        <form action={markShippedAction} className="flex flex-col gap-2">
                          <input type="hidden" name="orderId" value={o.id} />
                          <input
                            name="trackingId"
                            placeholder="Tracking ID"
                            required
                            className={inputClass}
                          />
                          <input
                            name="trackingUrl"
                            placeholder="Tracking URL"
                            type="url"
                            required
                            className={inputClass}
                          />
                          <button type="submit" className={secondaryButtonClass}>
                            Mark shipped
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {o.status === 'SHIPPED' || o.status === 'DELIVERED'
                            ? 'Shipped'
                            : 'Not shippable'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
