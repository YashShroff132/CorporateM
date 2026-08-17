/**
 * /product/[slug] — server-rendered Product Detail Page (Requirement 3).
 *
 * Fetches a single PUBLISHED product (with variants + collection) through the
 * isolated data-access layer and builds the presentational view model with the
 * pure `services/pdp` logic. Renders the tier badge, slogan, price, variant
 * selectors as a no-JS HTML GET form, an add-to-cart button, the size guide,
 * and the trust row. Unknown/unpublished slugs (or an unavailable DB) 404.
 *
 * The variant selection is driven entirely by URL params (color/size/fit) so
 * the page works with JavaScript disabled: choosing options and submitting the
 * form re-renders the page with the resolved variant, price, and availability.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { absoluteUrl } from '@/lib/site';
import { getProductBySlug, type ProductDetail } from '@/server/shop-data';
import { config } from '@/services/config';
import type { RawSearchParams } from '@/server/search-params';
import { addToCartAction } from '@/app/cart/actions';
import { TrackOnMount } from '@/components/TrackOnMount';
import { PdpProductSection } from '@/components/shop/PdpProductSection';
import {
  VARIANT_DIMENSIONS,
  buildPdpViewModel,
  variantPricePaise,
  type VariantDimension,
  type VariantSelection,
} from '@/services/pdp';

export const dynamic = 'force-dynamic';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

const DIMENSION_LABELS: Record<VariantDimension, string> = {
  color: 'Color',
  size: 'Size',
  fit: 'Fit',
};

/** Read a single string value for a dimension from the raw search params. */
function readSelection(raw: RawSearchParams, fallbackFit = 'Oversized'): VariantSelection {
  const selection: VariantSelection = {};
  for (const dim of VARIANT_DIMENSIONS) {
    const value = raw[dim];
    const chosen = Array.isArray(value) ? value[0] : value;
    if (typeof chosen === 'string' && chosen.length > 0) {
      selection[dim] = chosen;
    }
  }
  if (!selection.fit) {
    selection.fit = fallbackFit;
  }
  return selection;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getProductBySlug(slug);
  if (detail === null) {
    return { title: 'Product Not Found' };
  }
  const { product } = detail;
  const canonical = absoluteUrl(`/product/${product.slug}`);
  const title = clamp(
    product.seoTitle ?? product.slogan,
    60,
  );
  const description = clamp(
    product.seoDescription ??
      `${product.slogan}. Shop this design from Out of Office.`,
    160,
  );
  const images = product.mockupUrl !== undefined ? [product.mockupUrl] : [];
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonical,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images,
    },
  };
}

/** Clamp a string to a maximum length, trimming whitespace (SEO bounds). */
function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).trimEnd();
}

/**
 * Build Product JSON-LD (schema.org) for the PDP (Req 3.8 / 19.x). Prices are
 * whole rupees derived from paise (paise / 100) with currency INR; availability
 * reflects whether any variant has stock. Emitted as a `<script>` tag inline.
 */
function buildProductJsonLd(detail: ProductDetail): Record<string, unknown> {
  const { product, variants } = detail;
  const inStock = variants.some((v) => v.stock > 0);
  // Lowest offered price across variants (honoring per-variant overrides).
  const lowestPaise = variants.reduce(
    (min, v) => Math.min(min, variantPricePaise(product, v)),
    product.basePrice,
  );
  const priceRupees = (lowestPaise / 100).toFixed(2);

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.slogan,
    description:
      product.seoDescription ??
      `${product.slogan}. Shop this design from Out of Office.`,
    ...(product.mockupUrl !== undefined
      ? { image: product.mockupUrl.startsWith('http') ? product.mockupUrl : absoluteUrl(product.mockupUrl) }
      : {}),
    sku: product.slug,
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/product/${product.slug}`),
      priceCurrency: 'INR',
      price: priceRupees,
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: ProductPageProps) {
  const { slug } = await params;
  const detail = await getProductBySlug(slug);
  if (detail === null) {
    notFound();
  }

  const raw = await searchParams;
  const fallbackFit = detail.variants[0]?.fit ?? 'Oversized';
  const selection = readSelection(raw, fallbackFit);

  const vm = buildPdpViewModel(
    {
      product: detail.product,
      variants: detail.variants,
      collection: detail.collection,
      selection,
    },
    config,
  );

  const { addToCart } = vm.actions;
  const jsonLd = buildProductJsonLd(detail);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      {/* Product JSON-LD structured data (Req 3.8 / 19.x). */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Emit the product_view funnel event on the client (Req 19.5). */}
      <TrackOnMount
        event="product_view"
        props={{
          slug: detail.product.slug,
          slogan: detail.product.slogan,
          // Meta Catalog matching fields (required for dynamic ads)
          content_ids: [detail.product.slug],
          content_type: 'product',
          value: (detail.product.basePrice / 100).toFixed(2),
          currency: 'INR',
        }}
      />
      <PdpProductSection
        detail={detail}
        vm={vm}
        selection={selection}
        dimensionLabels={DIMENSION_LABELS}
        variantDimensions={VARIANT_DIMENSIONS}
        addToCartEnabled={addToCart.enabled}
        addToCartReason={addToCart.reason}
        addToCartPrompt={addToCart.prompt}
        addToCartAction={addToCartAction}
      />

      {/* Size guide (Req 3.5) */}
      {vm.sizeGuide.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-black tracking-tight">Size guide</h2>
          <table className="w-full max-w-md border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/20 text-left">
                <th className="py-2 pr-4 font-bold">Size</th>
                <th className="py-2 pr-4 font-bold">Chest (cm)</th>
                <th className="py-2 font-bold">Length (cm)</th>
              </tr>
            </thead>
            <tbody>
              {vm.sizeGuide.map((row) => (
                <tr key={row.size} className="border-b border-ink/10">
                  <td className="py-2 pr-4">{row.size}</td>
                  <td className="py-2 pr-4">{row.chestCm}</td>
                  <td className="py-2">{row.lengthCm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Trust row (Req 3.10) */}
      <section aria-label="Store assurances">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          {vm.trustRow.codAvailable && <li>Cash on delivery available</li>}
          <li>{vm.trustRow.returnsWindow} returns</li>
          <li>Secure Razorpay checkout</li>
          <li>Dispatch in {vm.trustRow.dispatchTime}</li>
        </ul>
      </section>
    </main>
  );
}
