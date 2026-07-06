/**
 * /admin/products — list products of all statuses, with publish toggle, edit,
 * and delete. Prices display in rupees. Degrades to a notice without a DB.
 */

import Link from 'next/link';

import { requireAdmin } from '@/server/admin-auth';
import {
  listProducts,
  paiseToRupeesString,
  DB_UNAVAILABLE,
} from '@/server/admin-data';
import {
  AdminShell,
  Notice,
  dangerButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../ui';
import { deleteProductAction, togglePublishAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: 'bg-success/15 text-success',
  DRAFT: 'bg-muted/15 text-muted',
  PENDING_REVIEW: 'bg-highlighter/40 text-ink',
  ARCHIVED: 'bg-ink/10 text-ink',
};

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function ProductsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const { error } = await searchParams;
  const products = await listProducts();

  return (
    <AdminShell
      title="Products"
      actions={
        <Link href="/admin/products/new" className={primaryButtonClass}>
          New product
        </Link>
      }
    >
      {error !== undefined && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {products === DB_UNAVAILABLE ? (
        <Notice kind="error">Database not connected. Products cannot be loaded.</Notice>
      ) : products.length === 0 ? (
        <Notice>No products yet. Create your first one.</Notice>
      ) : (
        <div className="overflow-x-auto rounded border border-ink/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 bg-paper text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Collection</th>
                <th className="px-4 py-3">Price (₹)</th>
                <th className="px-4 py-3">Variants</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-bold">{p.slug}</div>
                    <div className="text-xs text-muted">{p.slogan}</div>
                  </td>
                  <td className="px-4 py-3">{p.tier}</td>
                  <td className="px-4 py-3">{p.collectionTitle}</td>
                  <td className="px-4 py-3">{paiseToRupeesString(p.basePrice)}</td>
                  <td className="px-4 py-3">{p.variantCount}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded px-2 py-1 text-xs font-bold ${STATUS_STYLES[p.status] ?? ''}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <form action={togglePublishAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="current" value={p.status} />
                        <button type="submit" className={secondaryButtonClass}>
                          {p.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                        </button>
                      </form>
                      <Link
                        href={`/admin/products/${p.id}/edit`}
                        className={secondaryButtonClass}
                      >
                        Edit
                      </Link>
                      <form action={deleteProductAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className={dangerButtonClass}>
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
