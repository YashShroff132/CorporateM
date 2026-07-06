'use server';

/**
 * Product + variant server actions. Validate with Zod, convert rupee inputs to
 * integer paise, persist via the admin data layer (which writes AuditLog rows),
 * and redirect. Errors are surfaced through redirect query params so the forms
 * work without client JS.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/server/admin-auth';
import {
  createProduct,
  createVariant,
  deleteProduct,
  deleteVariant,
  rupeesToPaise,
  setProductStatus,
  updateProduct,
  updateVariant,
  type ProductStatus,
} from '@/server/admin-data';
import { fieldErrors, productSchema, variantSchema } from '../validation';

function encodeError(field: string | undefined, message: string): string {
  const params = new URLSearchParams({ error: message });
  if (field !== undefined) params.set('field', field);
  return params.toString();
}

export async function saveProductAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = formData.get('id');
  const editing = typeof id === 'string' && id.length > 0;
  const basePath = editing ? `/admin/products/${id}/edit` : '/admin/products/new';

  const parsed = productSchema.safeParse({
    slug: formData.get('slug'),
    slogan: formData.get('slogan'),
    tier: formData.get('tier'),
    collectionId: formData.get('collectionId'),
    status: formData.get('status'),
    basePriceRupees: formData.get('basePriceRupees'),
    seoTitle: formData.get('seoTitle'),
    seoDescription: formData.get('seoDescription'),
    mockupUrl: formData.get('mockupUrl'),
  });

  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    const [field, message] = Object.entries(errors)[0] ?? ['form', 'Invalid input.'];
    redirect(`${basePath}?${encodeError(field, message)}`);
  }

  const data = {
    slug: parsed.data.slug,
    slogan: parsed.data.slogan,
    tier: parsed.data.tier,
    collectionId: parsed.data.collectionId,
    status: parsed.data.status,
    basePrice: rupeesToPaise(parsed.data.basePriceRupees),
    seoTitle: parsed.data.seoTitle,
    seoDescription: parsed.data.seoDescription,
    mockupUrl: parsed.data.mockupUrl,
  };

  const result = editing
    ? await updateProduct(id, data)
    : await createProduct(data);

  if (!result.ok) {
    redirect(`${basePath}?${encodeError(result.field, result.message)}`);
  }

  revalidatePath('/admin/products');
  revalidatePath('/shop');
  redirect('/admin/products');
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get('id');
  if (typeof id !== 'string' || id.length === 0) {
    redirect('/admin/products');
  }
  const result = await deleteProduct(id as string);
  if (!result.ok) {
    redirect(`/admin/products?${encodeError(undefined, result.message)}`);
  }
  revalidatePath('/admin/products');
  revalidatePath('/shop');
  redirect('/admin/products');
}

export async function togglePublishAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get('id');
  const current = formData.get('current');
  if (typeof id !== 'string' || id.length === 0) {
    redirect('/admin/products');
  }
  const next: ProductStatus = current === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
  const result = await setProductStatus(id as string, next);
  if (!result.ok) {
    redirect(`/admin/products?${encodeError(undefined, result.message)}`);
  }
  revalidatePath('/admin/products');
  revalidatePath('/shop');
  redirect('/admin/products');
}

// ---------------------------------------------------------------------------
// Variants (managed from the product edit page)
// ---------------------------------------------------------------------------

export async function saveVariantAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const productId = formData.get('productId');
  if (typeof productId !== 'string' || productId.length === 0) {
    redirect('/admin/products');
  }
  const variantId = formData.get('variantId');
  const editing = typeof variantId === 'string' && variantId.length > 0;
  const basePath = `/admin/products/${productId}/edit`;

  const parsed = variantSchema.safeParse({
    sku: formData.get('sku'),
    color: formData.get('color'),
    size: formData.get('size'),
    fit: formData.get('fit'),
    priceOverrideRupees: formData.get('priceOverrideRupees'),
    stock: formData.get('stock'),
  });

  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    const [field, message] = Object.entries(errors)[0] ?? ['form', 'Invalid input.'];
    redirect(`${basePath}?${encodeError(`variant_${field}`, message)}`);
  }

  const data = {
    sku: parsed.data.sku,
    color: parsed.data.color,
    size: parsed.data.size,
    fit: parsed.data.fit,
    priceOverride:
      parsed.data.priceOverrideRupees === null
        ? null
        : rupeesToPaise(parsed.data.priceOverrideRupees),
    stock: parsed.data.stock,
  };

  const result = editing
    ? await updateVariant(variantId, data)
    : await createVariant(productId as string, data);

  if (!result.ok) {
    redirect(`${basePath}?${encodeError('variant_sku', result.message)}`);
  }

  revalidatePath(basePath);
  revalidatePath('/shop');
  redirect(basePath);
}

export async function deleteVariantAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const productId = formData.get('productId');
  const variantId = formData.get('variantId');
  const basePath =
    typeof productId === 'string' && productId.length > 0
      ? `/admin/products/${productId}/edit`
      : '/admin/products';
  if (typeof variantId !== 'string' || variantId.length === 0) {
    redirect(basePath);
  }
  const result = await deleteVariant(variantId as string);
  if (!result.ok) {
    redirect(`${basePath}?${encodeError(undefined, result.message)}`);
  }
  revalidatePath(basePath);
  revalidatePath('/shop');
  redirect(basePath);
}
