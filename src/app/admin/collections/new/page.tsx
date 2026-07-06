/** /admin/collections/new — create a collection. */

import { requireAdmin } from '@/server/admin-auth';
import { AdminShell } from '../../ui';
import { CollectionForm } from '../CollectionForm';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ error?: string; field?: string }>;
}

export default async function NewCollectionPage({ searchParams }: PageProps) {
  await requireAdmin();
  const { error, field } = await searchParams;
  return (
    <AdminShell title="New Collection">
      <CollectionForm error={error} errorField={field} />
    </AdminShell>
  );
}
