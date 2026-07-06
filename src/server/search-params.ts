/**
 * Convert Next.js App Router `searchParams` (a record of string | string[]) into
 * a `URLSearchParams` so the pure {@link parseShopQuery} parser can consume it.
 * Repeated params (arrays) are preserved as repeated entries.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function toURLSearchParams(raw: RawSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.append(key, value);
    }
  }
  return params;
}

/** Distinct, sorted color values across a set of shop products. */
export function facetValues<T extends { colors: string[]; sizes: string[] }>(
  products: readonly T[],
): { colors: string[]; sizes: string[] } {
  const colors = new Set<string>();
  const sizes = new Set<string>();
  for (const p of products) {
    for (const c of p.colors) colors.add(c);
    for (const s of p.sizes) sizes.add(s);
  }
  return {
    colors: [...colors].sort(),
    sizes: [...sizes].sort(),
  };
}
