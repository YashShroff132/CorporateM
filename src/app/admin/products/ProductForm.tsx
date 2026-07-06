/**
 * Shared product create/edit form. Base price is entered in rupees and
 * converted to paise on save. When `product` is provided the form is in edit
 * mode. The collection select is populated from existing collections.
 */

import Link from 'next/link';

import type { AdminProductDetail } from '@/server/admin-data';
import { paiseToRupeesNumber } from '@/server/admin-data';
import {
  Field,
  Notice,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../ui';
import { saveProductAction } from './actions';

const TIERS = ['SAFE', 'DIRECT', 'VERY_DIRECT'] as const;
const STATUSES = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;

export function ProductForm({
  product,
  collections,
  error,
  errorField,
}: {
  product?: AdminProductDetail;
  collections: { id: string; title: string }[];
  error?: string;
  errorField?: string;
}) {
  const editing = product !== undefined;
  const selectClass = inputClass;

  return (
    <form action={saveProductAction} className="max-w-2xl space-y-5">
      {error !== undefined && errorField !== 'slug' && (
        <Notice kind="error">{error}</Notice>
      )}
      {editing && <input type="hidden" name="id" value={product.id} />}

      {collections.length === 0 && (
        <Notice kind="error">
          No collections exist yet. Create a collection before adding products.
        </Notice>
      )}

      <Field label="Slug" htmlFor="slug" hint="Unique, 1–200 characters. Used in the product URL.">
        <input
          id="slug"
          name="slug"
          type="text"
          required
          maxLength={200}
          defaultValue={product?.slug ?? ''}
          className={inputClass}
        />
        {errorField === 'slug' && error !== undefined && (
          <span className="text-xs font-bold text-stamp-red">{error}</span>
        )}
      </Field>

      <Field label="Slogan" htmlFor="slogan">
        <input
          id="slogan"
          name="slogan"
          type="text"
          required
          defaultValue={product?.slogan ?? ''}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Tier" htmlFor="tier">
          <select
            id="tier"
            name="tier"
            defaultValue={product?.tier ?? 'SAFE'}
            className={selectClass}
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Collection" htmlFor="collectionId">
          <select
            id="collectionId"
            name="collectionId"
            required
            defaultValue={product?.collectionId ?? ''}
            className={selectClass}
          >
            <option value="" disabled>
              Select a collection…
            </option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Base price (₹)" htmlFor="basePriceRupees" hint="In rupees, e.g. 799 or 799.50.">
          <input
            id="basePriceRupees"
            name="basePriceRupees"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={
              product !== undefined ? paiseToRupeesNumber(product.basePrice) : ''
            }
            className={inputClass}
          />
        </Field>

        <Field label="Status" htmlFor="status">
          <select
            id="status"
            name="status"
            defaultValue={product?.status ?? 'DRAFT'}
            className={selectClass}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Mockup image URL" htmlFor="mockupUrl" hint="Optional. http(s) URL.">
        <input
          id="mockupUrl"
          name="mockupUrl"
          type="url"
          defaultValue={product?.mockupUrl ?? ''}
          className={inputClass}
        />
      </Field>

      <Field label="SEO title" htmlFor="seoTitle" hint="Optional, up to 60 characters.">
        <input
          id="seoTitle"
          name="seoTitle"
          type="text"
          maxLength={60}
          defaultValue={product?.seoTitle ?? ''}
          className={inputClass}
        />
      </Field>

      <Field label="SEO description" htmlFor="seoDescription" hint="Optional, up to 160 characters.">
        <textarea
          id="seoDescription"
          name="seoDescription"
          maxLength={160}
          rows={3}
          defaultValue={product?.seoDescription ?? ''}
          className={inputClass}
        />
      </Field>

      <div className="flex gap-3 pt-2">
        <button type="submit" className={primaryButtonClass}>
          {editing ? 'Save changes' : 'Create product'}
        </button>
        <Link href="/admin/products" className={secondaryButtonClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
