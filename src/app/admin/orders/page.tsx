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
import { AdminOrdersTable } from './AdminOrdersTable';
import { markShippedAction } from './actions';

export const dynamic = 'force-dynamic';

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
        className="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4 shadow-sm"
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
        <AdminOrdersTable orders={orders} markShippedAction={markShippedAction} />
      )}
    </AdminShell>
  );
}
