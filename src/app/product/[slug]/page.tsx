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
import { ProductImage } from '@/components/ProductImage';
import { AddToCartButton } from '@/components/AddToCartButton';
import { TrackOnMount } from '@/components/TrackOnMount';
import { VariantSelector } from '@/components/VariantSelector';
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
function readSelection(raw: RawSearchParams): VariantSelection {
  const selection: VariantSelection = {};
  for (const dim of VARIANT_DIMENSIONS) {
    const value = raw[dim];
    const chosen = Array.isArray(value) ? value[0] : value;
    if (typeof chosen === 'string' && chosen.length > 0) {
      selection[dim] = chosen;
    }
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
    ...(product.mockupUrl !== undefined ? { image: product.mockupUrl } : {}),
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
  const selection = readSelection(raw);

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
        props={{ slug: detail.product.slug, slogan: detail.product.slogan }}
      />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Product mockups — front & back views */}
        <div className="flex flex-col gap-3">
          <div className="relative aspect-square w-full">
            {detail.product.mockupUrl?.startsWith('data:') ? (
              <>
                <ProductImage
                  src={detail.product.mockupBgUrl || (detail.variants.some(v => v.color.toLowerCase().includes('white')) ? '/blank-white-tee.png' : '/blank-black-tee.png')}
                  alt={detail.product.slogan}
                  priority
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
                <div className={`absolute inset-0 pointer-events-none select-none ${
                  detail.variants.some(v => v.color.toLowerCase().includes('white')) ? 'mix-blend-multiply opacity-90' : 'mix-blend-screen opacity-90'
                }`}>
                  <img
                    src={detail.product.mockupUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              </>
            ) : (
              <ProductImage
                src={detail.product.mockupUrl}
                alt={detail.product.slogan}
                priority
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            )}
          </div>

          {detail.product.mockupBackUrl && (
            <div className="relative aspect-square w-full flex flex-col justify-between p-12 bg-ink text-paper dark:bg-paper dark:text-ink border border-ink/25 font-mono select-none rounded-lg shadow-sm text-center">
              <div className="flex flex-col items-center justify-center my-auto">
                <span className="text-6xl font-black tracking-[0.25em] leading-none mb-2">OOO</span>
                <span className="text-xs uppercase tracking-widest text-highlighter font-bold">OUT OF OFFICE</span>
              </div>
              
              <div className="border-t border-paper/10 dark:border-ink/10 pt-6">
                <span className="text-sm font-bold uppercase tracking-wide leading-relaxed block">{detail.product.slogan}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-ink px-2 py-1 text-xs font-bold uppercase tracking-wide text-paper">
              {vm.tierBadge.label}
            </span>
            <span className="text-xs uppercase tracking-wide text-muted">
              {vm.collectionTag}
            </span>
            {vm.spicyIndicator && (
              <span className="bg-stamp-red px-2 py-1 text-xs font-bold uppercase tracking-wide text-paper">
                Spicy
              </span>
            )}
          </div>

          <h1 className="text-3xl font-black tracking-tight">{vm.slogan}</h1>

          {vm.priceInr !== undefined && (
            <div className="flex items-baseline gap-2.5">
              <span className="text-2xl font-bold text-ink">₹{vm.priceInr}</span>
              <span className="line-through text-base text-muted font-normal">
                ₹{(Math.ceil(Number(vm.priceInr!.replace(/,/g, '')) / 0.6 / 100) * 100 - 1)}
              </span>
              <span className="bg-stamp-red/10 text-stamp-red px-2 py-0.5 text-xs font-bold rounded">
                40% OFF
              </span>
            </div>
          )}

          {/* Variant selectors — automatically re-renders on selection change. */}
          <form method="get" className="flex flex-col gap-4" aria-label="Choose options">
            <VariantSelector
              options={vm.options}
              selection={selection}
              dimensionLabels={DIMENSION_LABELS}
              variantDimensions={VARIANT_DIMENSIONS}
            />
          </form>

          {/* Add to cart — gated on a complete, in-stock selection. */}
          <form action={addToCartAction} className="flex flex-col gap-2">
            {vm.selectedVariant !== undefined && (
              <input type="hidden" name="variantId" value={vm.selectedVariant.id} />
            )}
            <AddToCartButton
              enabled={addToCart.enabled}
              outOfStock={addToCart.reason === 'OUT_OF_STOCK'}
              eventProps={{
                slug: detail.product.slug,
                variantId: vm.selectedVariant?.id,
              }}
            />
            {addToCart.prompt !== undefined && (
              <p role="status" className="text-sm text-stamp-red">
                {addToCart.prompt}
              </p>
            )}
          </form>
        </div>
      </div>

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
