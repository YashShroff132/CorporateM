/**
 * Variant management for a product's edit page: each existing variant is its
 * own HTML form laid out as a row (so no-JS inline edit/delete works reliably —
 * table cells cannot host per-row forms), plus an "add variant" form. Price
 * override is entered in rupees. No client JS required.
 */

import type { AdminVariant } from '@/server/admin-data';
import { paiseToRupeesNumber } from '@/server/admin-data';
import { Notice, dangerButtonClass, inputClass, secondaryButtonClass } from '../ui';
import { deleteVariantAction, saveVariantAction } from './actions';

const cellInput = `${inputClass} px-2 py-1`;

const HEADERS = ['SKU', 'Color', 'Size', 'Fit', 'Override ₹', 'Stock'] as const;

function VariantRowFields({ variant }: { variant?: AdminVariant }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
      <input
        name="sku"
        type="text"
        required
        maxLength={64}
        defaultValue={variant?.sku ?? ''}
        placeholder="SKU"
        aria-label="SKU"
        className={cellInput}
      />
      <input
        name="color"
        type="text"
        required
        defaultValue={variant?.color ?? ''}
        placeholder="Color"
        aria-label="Color"
        className={cellInput}
      />
      <input
        name="size"
        type="text"
        required
        defaultValue={variant?.size ?? ''}
        placeholder="Size"
        aria-label="Size"
        className={cellInput}
      />
      <input
        name="fit"
        type="text"
        required
        defaultValue={variant?.fit ?? ''}
        placeholder="Fit"
        aria-label="Fit"
        className={cellInput}
      />
      <input
        name="priceOverrideRupees"
        type="number"
        min={0}
        step="0.01"
        defaultValue={
          variant?.priceOverride != null
            ? paiseToRupeesNumber(variant.priceOverride)
            : ''
        }
        placeholder="—"
        aria-label="Price override in rupees"
        className={cellInput}
      />
      <input
        name="stock"
        type="number"
        min={0}
        step={1}
        required
        defaultValue={variant?.stock ?? 0}
        aria-label="Stock"
        className={cellInput}
      />
    </div>
  );
}

export function VariantsManager({
  productId,
  variants,
  error,
}: {
  productId: string;
  variants: AdminVariant[];
  error?: string;
}) {
  return (
    <div className="space-y-4">
      {error !== undefined && <Notice kind="error">{error}</Notice>}

      <div className="hidden gap-2 px-1 text-xs font-bold uppercase tracking-wide text-muted sm:grid sm:grid-cols-[1fr_auto]">
        <div className="grid grid-cols-6 gap-2">
          {HEADERS.map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>
        <span className="w-40 text-right">Actions</span>
      </div>

      {variants.length === 0 && (
        <p className="text-sm text-muted">No variants yet. Add the first one below.</p>
      )}

      {variants.map((v) => (
        <form
          key={v.id}
          action={saveVariantAction}
          className="flex flex-col gap-2 rounded border border-ink/10 bg-white p-2 sm:flex-row sm:items-center"
        >
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="variantId" value={v.id} />
          <div className="flex-1">
            <VariantRowFields variant={v} />
          </div>
          <div className="flex items-center gap-2 sm:w-40 sm:justify-end">
            <button type="submit" className={secondaryButtonClass}>
              Save
            </button>
            <button
              type="submit"
              formAction={deleteVariantAction}
              className={dangerButtonClass}
            >
              Delete
            </button>
          </div>
        </form>
      ))}

      <form
        action={saveVariantAction}
        className="flex flex-col gap-2 rounded border border-dashed border-corporate/40 bg-corporate/5 p-2 sm:flex-row sm:items-center"
      >
        <input type="hidden" name="productId" value={productId} />
        <div className="flex-1">
          <VariantRowFields />
        </div>
        <div className="flex items-center gap-2 sm:w-40 sm:justify-end">
          <button type="submit" className={secondaryButtonClass}>
            Add variant
          </button>
        </div>
      </form>
    </div>
  );
}
