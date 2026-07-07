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

  const handleChipClick = (dim: VariantDimension, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    // Toggle: if already selected, deselect; otherwise select.
    if (selection[dim] === value) {
      params.delete(dim);
    } else {
      params.set(dim, value);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-4">
      {variantDimensions
        .filter((dim) => options[dim].length > 0)
        .map((dim) => (
          <fieldset key={dim} className="flex flex-col gap-1.5">
            <legend className="text-xs font-bold uppercase tracking-widest text-ink/50 mb-1">
              {dimensionLabels[dim]}
            </legend>
            <div className="flex flex-wrap gap-2">
              {options[dim].map((value) => {
                const isSelected = selection[dim] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleChipClick(dim, value)}
                    className={[
                      'min-w-[3rem] rounded border px-3.5 py-1.5 text-sm font-medium transition-colors duration-100',
                      isSelected
                        ? 'border-ink bg-ink text-paper'
                        : 'border-ink/20 bg-paper text-ink hover:border-ink',
                    ].join(' ')}
                    aria-pressed={isSelected}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
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
