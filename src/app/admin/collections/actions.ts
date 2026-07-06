'use server';

/**
 * Collection server actions — validate with Zod, persist via the admin data
 * layer (which writes an AuditLog row), then redirect. Validation/duplicate
 * errors are surfaced back to the form via a redirect query param rather than
 * throwing, keeping the forms no-JS friendly.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/server/admin-auth';
import {
  createCollection,
  deleteCollection,
  updateCollection,
} from '@/server/admin-data';
import { collectionSchema, fieldErrors } from '../validation';

function encodeError(field: string | undefined, message: string): string {
  const params = new URLSearchParams({ error: message });
  if (field !== undefined) params.set('field', field);
  return params.toString();
}

export async function saveCollectionAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = formData.get('id');
  const editing = typeof id === 'string' && id.length > 0;
  const basePath = editing ? `/admin/collections/${id}/edit` : '/admin/collections/new';

  const parsed = collectionSchema.safeParse({
    slug: formData.get('slug'),
    title: formData.get('title'),
    heroImage: formData.get('heroImage'),
    sortOrder: formData.get('sortOrder'),
  });

  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    const [field, message] = Object.entries(errors)[0] ?? ['form', 'Invalid input.'];
    redirect(`${basePath}?${encodeError(field, message)}`);
  }

  const data = {
    slug: parsed.data.slug,
    title: parsed.data.title,
    heroImage: parsed.data.heroImage,
    sortOrder: parsed.data.sortOrder,
  };

  const result = editing
    ? await updateCollection(id, data)
    : await createCollection(data);

  if (!result.ok) {
    redirect(`${basePath}?${encodeError(result.field, result.message)}`);
  }

  revalidatePath('/admin/collections');
  revalidatePath('/collections');
  redirect('/admin/collections');
}

export async function deleteCollectionAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get('id');
  if (typeof id !== 'string' || id.length === 0) {
    redirect('/admin/collections');
  }
  const result = await deleteCollection(id as string);
  if (!result.ok) {
    redirect(`/admin/collections?${encodeError(undefined, result.message)}`);
  }
  revalidatePath('/admin/collections');
  revalidatePath('/collections');
  redirect('/admin/collections');
}
