/**
 * Shared collection create/edit form. Plain HTML posting to the save action.
 * When `collection` is provided the form is in edit mode (hidden id field).
 */

import Link from 'next/link';

import type { AdminCollection } from '@/server/admin-data';
import {
  Field,
  Notice,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../ui';
import { saveCollectionAction } from './actions';

export function CollectionForm({
  collection,
  error,
  errorField,
}: {
  collection?: AdminCollection;
  error?: string;
  errorField?: string;
}) {
  const editing = collection !== undefined;
  return (
    <form action={saveCollectionAction} className="max-w-xl space-y-5">
      {error !== undefined && <Notice kind="error">{error}</Notice>}
      {editing && <input type="hidden" name="id" value={collection.id} />}

      <Field label="Slug" htmlFor="slug" hint="Unique, 1–200 characters. Used in the URL.">
        <input
          id="slug"
          name="slug"
          type="text"
          required
          maxLength={200}
          defaultValue={collection?.slug ?? ''}
          className={inputClass}
        />
        {errorField === 'slug' && error !== undefined && (
          <span className="text-xs font-bold text-stamp-red">{error}</span>
        )}
      </Field>

      <Field label="Title" htmlFor="title">
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={collection?.title ?? ''}
          className={inputClass}
        />
      </Field>

      <Field label="Hero image URL" htmlFor="heroImage" hint="Optional. http(s) URL.">
        <input
          id="heroImage"
          name="heroImage"
          type="url"
          defaultValue={collection?.heroImage ?? ''}
          className={inputClass}
        />
      </Field>

      <Field label="Sort order" htmlFor="sortOrder" hint="Lower numbers appear first.">
        <input
          id="sortOrder"
          name="sortOrder"
          type="number"
          min={0}
          step={1}
          defaultValue={collection?.sortOrder ?? 0}
          className={inputClass}
        />
      </Field>

      <div className="flex gap-3 pt-2">
        <button type="submit" className={primaryButtonClass}>
          {editing ? 'Save changes' : 'Create collection'}
        </button>
        <Link href="/admin/collections" className={secondaryButtonClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
