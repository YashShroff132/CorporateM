/**
 * /admin/collections — list all collections with edit/delete and a "new" link.
 * Degrades to a "database not connected" notice when the DB is unreachable.
 */

import Link from 'next/link';

import { requireAdmin } from '@/server/admin-auth';
import { listCollections, DB_UNAVAILABLE } from '@/server/admin-data';
import {
  AdminShell,
  Notice,
  dangerButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../ui';
import { deleteCollectionAction } from './actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function CollectionsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const { error } = await searchParams;
  const collections = await listCollections();

  return (
    <AdminShell
      title="Collections"
      actions={
        <Link href="/admin/collections/new" className={primaryButtonClass}>
          New collection
        </Link>
      }
    >
      {error !== undefined && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {collections === DB_UNAVAILABLE ? (
        <Notice kind="error">Database not connected. Collections cannot be loaded.</Notice>
      ) : collections.length === 0 ? (
        <Notice>No collections yet. Create your first one.</Notice>
      ) : (
        <div className="overflow-hidden rounded border border-ink/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 bg-paper text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Sort</th>
                <th className="px-4 py-3">Products</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c) => (
                <tr key={c.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-3 font-bold">{c.title}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{c.slug}</td>
                  <td className="px-4 py-3">{c.sortOrder}</td>
                  <td className="px-4 py-3">{c.productCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/collections/${c.id}/edit`}
                        className={secondaryButtonClass}
                      >
                        Edit
                      </Link>
                      <form action={deleteCollectionAction}>
                        <input type="hidden" name="id" value={c.id} />
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
