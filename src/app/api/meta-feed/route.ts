/**
 * GET /api/meta-feed — Meta Commerce Manager Product Feed (CSV format)
 *
 * Returns all published products in the OOO catalogue as a CSV that Meta
 * Commerce Manager can crawl automatically to populate the product catalog.
 *
 * Format: Meta Product Catalog CSV feed specification
 * https://developers.facebook.com/docs/marketing-api/catalog/reference/
 *
 * Schedule this URL in Meta Commerce Manager → Data Sources → Data Feed
 * URL: https://oofo.tech/api/meta-feed
 */

import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getPrisma();
  const products = await db.product.findMany({
    where: { status: 'PUBLISHED' },
    include: {
      variants: {
        where: { stock: { gt: 0 } },
        take: 1, // one representative variant per product
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://oofo.tech';

  // CSV header per Meta spec
  const headers = [
    'id',
    'title',
    'description',
    'availability',
    'condition',
    'price',
    'link',
    'image_link',
    'brand',
    'google_product_category',
    'item_group_id',
    'color',
    'size',
    'age_group',
    'gender',
  ];

  const rows: string[] = [headers.join(',')];

  for (const product of products) {
    const variant = product.variants[0];
    const priceInr = (product.basePrice / 100).toFixed(2);
    const color = variant?.color ?? 'Black';
    const size = variant?.size ?? 'M';

    const row = [
      csvEscape(product.slug),
      csvEscape(product.seoTitle ?? product.slogan),
      csvEscape(product.seoDescription ?? product.slogan),
      'in stock',
      'new',
      csvEscape(`${priceInr} INR`),
      csvEscape(`${SITE}/product/${product.slug}`),
      csvEscape(product.mockupUrl ? `${SITE}${product.mockupUrl}` : ''),
      csvEscape('Out of Office'),
      csvEscape('Apparel & Accessories > Clothing > Shirts & Tops'),
      csvEscape(product.slug),
      csvEscape(color),
      csvEscape(size),
      'adult',
      'unisex',
    ];

    rows.push(row.join(','));
  }

  const csv = rows.join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/** Wrap a value in double-quotes and escape any internal double-quotes. */
function csvEscape(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}
