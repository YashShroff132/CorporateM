'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ProductImageGallery } from './ProductImageGallery';
import { WfhDesignSelector } from './WfhDesignSelector';
import { VariantSelector } from '@/components/VariantSelector';
import { AddToCartButton } from '@/components/AddToCartButton';
import type { VariantSelection, VariantDimension, PdpViewModel } from '@/services/pdp';
import type { ProductDetail } from '@/server/shop-data';

interface PdpProductSectionProps {
  detail: ProductDetail;
  vm: PdpViewModel;
  selection: VariantSelection;
  dimensionLabels: Record<VariantDimension, string>;
  variantDimensions: readonly VariantDimension[];
  addToCartEnabled: boolean;
  addToCartReason?: string;
  addToCartPrompt?: string;
  addToCartAction: (formData: FormData) => Promise<void>;
}

export function PdpProductSection({
  detail,
  vm,
  selection,
  dimensionLabels,
  variantDimensions,
  addToCartEnabled,
  addToCartReason,
  addToCartPrompt,
  addToCartAction,
}: PdpProductSectionProps) {
  const [slogan, setSlogan] = useState<string>(vm.slogan);
  const [selectedGalleryIndex, setSelectedGalleryIndex] = useState<number | undefined>(undefined);

  const isWfhProduct = detail.product.slug === 'boyfriend-wfh';

  const handleSloganChange = (newSlogan: string, _label: string, slideIndex: number) => {
    setSlogan(newSlogan);
    setSelectedGalleryIndex(slideIndex);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Top Back Navigation Bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/shop#catalog"
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-3.5 py-2 rounded-lg border border-ink/15 dark:border-white/20 bg-paper dark:bg-black text-ink dark:text-white shadow-sm hover:border-ink hover:bg-ink hover:text-paper dark:hover:bg-white dark:hover:text-black hover:shadow transition-all duration-150 cursor-pointer"
        >
          <span className="text-base leading-none">←</span>
          <span>Back to Shop</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Product Image Gallery */}
        <ProductImageGallery
          frontUrl={detail.product.mockupUrl ?? '/blank-black-tee.png'}
          backUrl={detail.product.mockupBackUrl}
          extraImages={detail.product.galleryUrls}
          slogan={detail.product.slogan}
          selectedIndex={selectedGalleryIndex}
        />

        {/* Product Details & Selection Column */}
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-ink px-2 py-1 text-xs font-bold uppercase tracking-wide text-paper dark:bg-white dark:text-black">
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

          <div className="flex flex-col gap-4">
            <h1 className="text-3xl font-black tracking-tight">{slogan}</h1>

            {isWfhProduct && (
              <WfhDesignSelector
                initialSlogan={vm.slogan}
                onSloganChange={handleSloganChange}
              />
            )}
          </div>

          {vm.priceInr !== undefined && (
            <div className="flex items-baseline gap-2.5">
              <span className="text-2xl font-bold text-ink dark:text-white">₹{vm.priceInr}</span>
              <span className="line-through text-base text-muted font-normal">
                ₹{Math.ceil(Number(vm.priceInr.replace(/,/g, '')) / 0.6 / 100) * 100 - 1}
              </span>
              <span className="bg-stamp-red/10 text-stamp-red px-2 py-0.5 text-xs font-bold rounded dark:bg-stamp-red/20 dark:text-red-400">
                40% OFF
              </span>
            </div>
          )}

          {/* Variant Selectors */}
          <form method="get" className="flex flex-col gap-4" aria-label="Choose options">
            <VariantSelector
              options={vm.options}
              selection={selection}
              dimensionLabels={dimensionLabels}
              variantDimensions={variantDimensions}
            />
          </form>

          {/* Add to Cart */}
          <form action={addToCartAction} className="flex flex-col gap-2">
            {vm.selectedVariant !== undefined && (
              <input type="hidden" name="variantId" value={vm.selectedVariant.id} />
            )}
            <AddToCartButton
              enabled={addToCartEnabled}
              outOfStock={addToCartReason === 'OUT_OF_STOCK'}
              eventProps={{
                slug: detail.product.slug,
                variantId: vm.selectedVariant?.id,
                content_ids: [detail.product.slug],
                content_type: 'product',
                value: (detail.product.basePrice / 100).toFixed(2),
                currency: 'INR',
              }}
            />
            {addToCartPrompt !== undefined && (
              <p role="status" className="text-sm text-stamp-red">
                {addToCartPrompt}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
