/**
 * /admin/products/[id]/edit — edit a product's fields plus manage its variants.
 */

import { notFound } from 'next/navigation';

import { requireAdmin } from '@/server/admin-auth';
import {
  getProduct,
  listCollectionOptions,
  DB_UNAVAILABLE,
} from '@/server/admin-data';
import { AdminShell, Notice } from '../../../ui';
import { ProductForm } from '../../ProductForm';
import { VariantsManager } from '../../VariantsManager';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; field?: string }>;
}

export default async function EditProductPage({
  params,
  searchParams,
}: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const { error, field } = await searchParams;
  const [product, collections] = await Promise.all([
    getProduct(id),
    listCollectionOptions(),
  ]);

  if (product === DB_UNAVAILABLE) {
    return (
      <AdminShell title="Edit Product">
        <Notice kind="error">Database not connected. Cannot load this product.</Notice>
      </AdminShell>
    );
  }
  if (product === null) {
    notFound();
  }

  const isVariantError = field?.startsWith('variant_') === true;
  const productError = isVariantError ? undefined : error;
  const variantError = isVariantError ? error : undefined;

  return (
    <AdminShell title="Edit Product">
      <div className="space-y-10">
        <section>
          <ProductForm
            product={product}
            collections={collections}
            error={productError}
            errorField={isVariantError ? undefined : field}
          />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-black uppercase tracking-tight">Variants</h2>
          <VariantsManager
            productId={product.id}
            variants={product.variants}
            error={variantError}
          />
        </section>
      </div>
    </AdminShell>
  );
}
