/**
 * Zod schemas for admin form input. Forms submit strings via FormData; these
 * schemas coerce/validate and enforce the catalog invariants (slug/SKU length,
 * price/stock ranges) before the data layer persists them. Rupee inputs are
 * validated here as rupees and converted to integer paise in the action layer.
 */

import { z } from 'zod';

const TIERS = ['SAFE', 'DIRECT', 'VERY_DIRECT'] as const;
const STATUSES = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;

/** Max rupees corresponding to the 99,999,999 paise product bound. */
const MAX_RUPEES = 999_999.99;

const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v.length === 0 ? null : v));

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v.length === 0 ? null : v))
  .refine(
    (v) => v === null || /^https?:\/\/.+/i.test(v),
    'Must be a valid http(s) URL.',
  );

export const collectionSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required.')
    .max(200, 'Slug must be at most 200 characters.'),
  title: z.string().trim().min(1, 'Title is required.').max(200),
  heroImage: optionalUrl,
  sortOrder: z.coerce
    .number()
    .int('Sort order must be a whole number.')
    .min(0, 'Sort order must be 0 or greater.')
    .max(100_000),
});

export type CollectionFormValues = z.infer<typeof collectionSchema>;

const rupees = z.coerce
  .number()
  .min(0, 'Price must be 0 or greater.')
  .max(MAX_RUPEES, 'Price is too large.');

export const productSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required.')
    .max(200, 'Slug must be at most 200 characters.'),
  slogan: z.string().trim().min(1, 'Slogan is required.').max(500),
  tier: z.enum(TIERS, { errorMap: () => ({ message: 'Choose a tier.' }) }),
  collectionId: z.string().trim().min(1, 'Choose a collection.'),
  status: z.enum(STATUSES, {
    errorMap: () => ({ message: 'Choose a status.' }),
  }),
  basePriceRupees: rupees,
  seoTitle: optionalTrimmed.pipe(
    z.string().max(60, 'SEO title must be at most 60 characters.').nullable(),
  ),
  seoDescription: optionalTrimmed.pipe(
    z
      .string()
      .max(160, 'SEO description must be at most 160 characters.')
      .nullable(),
  ),
  mockupUrl: optionalUrl,
  mockupBackUrl: optionalUrl,
});

export type ProductFormValues = z.infer<typeof productSchema>;

const optionalRupees = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v.length === 0 ? null : v))
  .refine(
    (v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= MAX_RUPEES),
    'Price override must be a valid amount.',
  )
  .transform((v) => (v === null ? null : Number(v)));

export const variantSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, 'SKU is required.')
    .max(64, 'SKU must be at most 64 characters.'),
  color: z.string().trim().min(1, 'Color is required.').max(64),
  size: z.string().trim().min(1, 'Size is required.').max(64),
  fit: z.string().trim().min(1, 'Fit is required.').max(64),
  priceOverrideRupees: optionalRupees,
  stock: z.coerce
    .number()
    .int('Stock must be a whole number.')
    .min(0, 'Stock must be 0 or greater.')
    .max(1_000_000, 'Stock is too large.'),
});

export type VariantFormValues = z.infer<typeof variantSchema>;

/** Flatten a ZodError to a { field: message } map (first error per field). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in out)) {
      out[key] = issue.message;
    }
  }
  return out;
}
