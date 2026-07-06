/**
 * /admin — gated dashboard. Shows headline counts (products, published,
 * collections, low-stock variants) and quick links. Degrades to a
 * "database not connected" notice when no DB is reachable.
 */

import Link from 'next/link';

import { requireAdmin } from '@/server/admin-auth';
import { getDashboardCounts, LOW_STOCK_THRESHOLD } from '@/server/admin-data';
import { AdminShell, Notice, primaryButtonClass, secondaryButtonClass } from './ui';

export const dynamic = 'force-dynamic';

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-ink/10 bg-white px-5 py-4">
      <div className="text-3xl font-black text-corporate">{value}</div>
      <div className="mt-1 text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const counts = await getDashboardCounts();

  return (
    <AdminShell title="Dashboard">
      {!counts.available && (
        <div className="mb-6">
          <Notice kind="error">
            Database not connected. Counts show 0 until the database is reachable.
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Products" value={counts.products} />
        <Stat label="Published" value={counts.published} />
        <Stat label="Collections" value={counts.collections} />
        <Stat
          label={`Low stock (≤${LOW_STOCK_THRESHOLD})`}
          value={counts.lowStockVariants}
        />
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/admin/products" className={primaryButtonClass}>
          Manage products
        </Link>
        <Link href="/admin/collections" className={secondaryButtonClass}>
          Manage collections
        </Link>
        <Link href="/admin/products/new" className={secondaryButtonClass}>
          New product
        </Link>
        <Link href="/admin/collections/new" className={secondaryButtonClass}>
          New collection
        </Link>
      </div>
    </AdminShell>
  );
}
