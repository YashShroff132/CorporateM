'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { VariantDimension } from '@/services/pdp';

interface VariantSelectorProps {
  options: Record<VariantDimension, readonly string[]>;
  selection: Record<string, string>;
  dimensionLabels: Record<VariantDimension, string>;
  variantDimensions: readonly VariantDimension[];
}

export function VariantSelector({
  options,
  selection,
  dimensionLabels,
  variantDimensions,
}: VariantSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSelectChange = (dim: VariantDimension, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(dim, value);
    } else {
      params.delete(dim);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-4">
      {variantDimensions
        .filter((dim) => options[dim].length > 0)
        .map((dim) => (
          <fieldset key={dim} className="flex flex-col gap-2">
            <label
              htmlFor={`select-${dim}`}
              className="text-sm font-bold uppercase tracking-wide"
            >
              {dimensionLabels[dim]}
            </label>
            <select
              id={`select-${dim}`}
              name={dim}
              value={selection[dim] ?? ''}
              onChange={(e) => handleSelectChange(dim, e.target.value)}
              className="border border-ink/20 px-2 py-2 text-sm bg-white"
            >
              <option value="">Select {dimensionLabels[dim].toLowerCase()}</option>
              {options[dim].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </fieldset>
        ))}

      {/* Render the submit button only for users without JavaScript (Server rendering fallback) */}
      <noscript>
        <button
          type="submit"
          className="border border-ink px-4 py-2 text-sm font-bold uppercase tracking-wide mt-2"
        >
          Update selection
        </button>
      </noscript>
    </div>
  );
}
