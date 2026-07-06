/** /admin/collections/[id]/edit — edit an existing collection. */

import { notFound } from 'next/navigation';

import { requireAdmin } from '@/server/admin-auth';
import { getCollection, DB_UNAVAILABLE } from '@/server/admin-data';
import { AdminShell, Notice } from '../../../ui';
import { CollectionForm } from '../../CollectionForm';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; field?: string }>;
}

export default async function EditCollectionPage({
  params,
  searchParams,
}: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const { error, field } = await searchParams;
  const collection = await getCollection(id);

  if (collection === DB_UNAVAILABLE) {
    return (
      <AdminShell title="Edit Collection">
        <Notice kind="error">Database not connected. Cannot load this collection.</Notice>
      </AdminShell>
    );
  }
  if (collection === null) {
    notFound();
  }

  return (
    <AdminShell title="Edit Collection">
      <CollectionForm collection={collection} error={error} errorField={field} />
    </AdminShell>
  );
}
