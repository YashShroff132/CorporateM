/**
 * GET /admin/orders/export — download the filtered orders as a CSV file
 * (Req 10.6). Reuses the same status + inclusive creation-date-range filter as
 * the list page (Req 10.5). Admin-gated; redirects to login when unauthenticated.
 */

import { NextResponse } from 'next/server';

import { hasAdminSession } from '@/server/admin-auth';
import {
  listOrdersForAdmin,
  ordersToCsv,
  ORDER_STATUS_VALUES,
  type AdminOrderFilter,
} from '@/server/order-data';
import type { OrderStatus } from '@/services/order';

export const dynamic = 'force-dynamic';

/** Parse an inclusive date bound; `end=true` extends to the end of the day. */
function parseDate(value: string | null, end: boolean): Date | undefined {
  if (value === null || value.trim().length === 0) return undefined;
  const d = new Date(end ? `${value}T23:59:59.999` : `${value}T00:00:00.000`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!(await hasAdminSession())) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const status =
    statusParam !== null && ORDER_STATUS_VALUES.includes(statusParam as OrderStatus)
      ? (statusParam as OrderStatus)
      : undefined;

  const filter: AdminOrderFilter = {
    status,
    from: parseDate(url.searchParams.get('from'), false),
    to: parseDate(url.searchParams.get('to'), true),
  };

  const rows = await listOrdersForAdmin(filter);
  const csv = ordersToCsv(rows);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="orders.csv"',
    },
  });
}
