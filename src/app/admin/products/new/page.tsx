/** /admin/products/new — create a product. */

import { requireAdmin } from '@/server/admin-auth';
import { listCollectionOptions } from '@/server/admin-data';
import { AdminShell } from '../../ui';
import { ProductForm } from '../ProductForm';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ error?: string; field?: string }>;
}

export default async function NewProductPage({ searchParams }: PageProps) {
  await requireAdmin();
  const { error, field } = await searchParams;
  const collections = await listCollectionOptions();
  return (
    <AdminShell title="New Product">
      <ProductForm collections={collections} error={error} errorField={field} />
    </AdminShell>
  );
}
