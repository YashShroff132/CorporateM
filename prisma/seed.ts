/**
 * Prisma seed script — Corporate Cult.
 *
 * Idempotent: safe to run repeatedly. Every row is created via `upsert` keyed on
 * a unique column (Collection.slug, Product.slug, Variant.sku, the Variant
 * (productId,color,size,fit) tuple, SloganBankEntry.text, and the BlankTemplate
 * (garment,color,preset) tuple), so `npx prisma db seed` run twice creates no
 * duplicates (design Req 25.8 idempotent seeding).
 *
 * Seeds:
 *  - A handful of on-brand Collections.
 *  - ~8 sample Products across all three bravery tiers, each PUBLISHED with a
 *    couple of Variants (color/size/fit, stock, basePrice in integer paise) so
 *    the shop is not empty on first launch.
 *  - A few SloganBankEntry and BlankTemplate rows to exercise the AI pipeline
 *    data model.
 *
 * All monetary values are integer paise (1 INR = 100 paise).
 */

import { PrismaClient, Tier, ProductStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

interface CollectionSeed {
  slug: string;
  title: string;
  sortOrder: number;
}

const COLLECTIONS: readonly CollectionSeed[] = [
  { slug: 'operator', title: 'Operator', sortOrder: 0 },
  { slug: 'believer', title: 'Believer', sortOrder: 1 },
  { slug: 'heretic', title: 'Heretic', sortOrder: 2 },
];

interface VariantSeed {
  color: string;
  size: string;
  fit: string;
  stock: number;
  /** Optional per-variant price override in paise. */
  priceOverride?: number;
}

interface ProductSeed {
  slug: string;
  slogan: string;
  tier: Tier;
  collectionSlug: string;
  /** Base price in integer paise (1 INR = 100 paise). */
  basePrice: number;
  seoTitle: string;
  seoDescription: string;
  variants: readonly VariantSeed[];
}

/** A small, reusable size/fit spread for a given colour. */
function sizeSpread(color: string, fit: string, stock: number): VariantSeed[] {
  return (['S', 'M', 'L', 'XL'] as const).map((size) => ({
    color,
    size,
    fit,
    stock,
  }));
}

const PRODUCTS: readonly ProductSeed[] = [
  // --- SAFE tier (Operator) ---
  {
    slug: 'quiet-quitting-champion',
    slogan: 'Quiet Quitting Champion',
    tier: Tier.SAFE,
    collectionSlug: 'operator',
    basePrice: 79900, // ₹799
    seoTitle: 'Quiet Quitting Champion Tee',
    seoDescription: 'A calm, understated flex for the corporate operator. 100% cotton.',
    variants: [
      ...sizeSpread('Black', 'Regular', 25),
      ...sizeSpread('White', 'Regular', 20),
    ],
  },
  {
    slug: 'reply-all-survivor',
    slogan: 'Reply-All Survivor',
    tier: Tier.SAFE,
    collectionSlug: 'operator',
    basePrice: 74900, // ₹749
    seoTitle: 'Reply-All Survivor Tee',
    seoDescription: 'For everyone who lived through the thread. Soft, breathable cotton.',
    variants: [
      ...sizeSpread('Navy', 'Regular', 18),
      ...sizeSpread('Grey', 'Oversized', 15),
    ],
  },
  {
    slug: 'circle-back-later',
    slogan: "Let's Circle Back Later",
    tier: Tier.SAFE,
    collectionSlug: 'operator',
    basePrice: 79900,
    seoTitle: "Let's Circle Back Later Tee",
    seoDescription: 'The polite deferral, immortalised on a premium tee.',
    variants: [...sizeSpread('Black', 'Oversized', 22)],
  },
  // --- DIRECT tier (Believer) ---
  {
    slug: 'this-couldve-been-an-email',
    slogan: "This Could've Been an Email",
    tier: Tier.DIRECT,
    collectionSlug: 'believer',
    basePrice: 89900, // ₹899
    seoTitle: "This Could've Been an Email Tee",
    seoDescription: 'Say the quiet part out loud. Heavyweight combed cotton.',
    variants: [
      ...sizeSpread('Black', 'Regular', 30),
      ...sizeSpread('Olive', 'Oversized', 12),
    ],
  },
  {
    slug: 'per-my-last-email',
    slogan: 'Per My Last Email',
    tier: Tier.DIRECT,
    collectionSlug: 'believer',
    basePrice: 84900,
    seoTitle: 'Per My Last Email Tee',
    seoDescription: 'Passive-aggression, now wearable. Premium cotton.',
    variants: [
      ...sizeSpread('White', 'Regular', 26),
      ...sizeSpread('Maroon', 'Regular', 14),
    ],
  },
  {
    slug: 'synergy-is-a-lie',
    slogan: 'Synergy Is a Lie',
    tier: Tier.DIRECT,
    collectionSlug: 'believer',
    basePrice: 89900,
    seoTitle: 'Synergy Is a Lie Tee',
    seoDescription: 'Call the buzzword bluff. Comfortable everyday fit.',
    variants: [...sizeSpread('Charcoal', 'Oversized', 19)],
  },
  // --- VERY_DIRECT tier (Heretic) ---
  {
    slug: 'i-am-the-attrition-problem',
    slogan: 'I Am the Attrition Problem',
    tier: Tier.VERY_DIRECT,
    collectionSlug: 'heretic',
    basePrice: 99900, // ₹999
    seoTitle: 'I Am the Attrition Problem Tee',
    seoDescription: 'For the openly unbothered. Heavyweight statement tee.',
    variants: [
      ...sizeSpread('Black', 'Oversized', 16),
      ...sizeSpread('Blood Red', 'Regular', 10),
    ],
  },
  {
    slug: 'burn-the-org-chart',
    slogan: 'Burn the Org Chart',
    tier: Tier.VERY_DIRECT,
    collectionSlug: 'heretic',
    basePrice: 104900, // ₹1049
    seoTitle: 'Burn the Org Chart Tee',
    seoDescription: 'Maximum bravery, minimum apology. Premium heavyweight cotton.',
    variants: [...sizeSpread('Black', 'Oversized', 13)],
  },
];

interface SloganSeed {
  text: string;
  tier: Tier;
}

const SLOGANS: readonly SloganSeed[] = [
  { text: 'Quiet Quitting Champion', tier: Tier.SAFE },
  { text: 'Reply-All Survivor', tier: Tier.SAFE },
  { text: "This Could've Been an Email", tier: Tier.DIRECT },
  { text: 'Per My Last Email', tier: Tier.DIRECT },
  { text: 'I Am the Attrition Problem', tier: Tier.VERY_DIRECT },
  { text: 'Burn the Org Chart', tier: Tier.VERY_DIRECT },
];

interface BlankTemplateSeed {
  garment: string;
  color: string;
  preset: string;
  printArea: { widthMm: number; heightMm: number; offsetTopMm: number };
}

const BLANK_TEMPLATES: readonly BlankTemplateSeed[] = [
  {
    garment: 'Classic Tee',
    color: 'Black',
    preset: 'center-chest',
    printArea: { widthMm: 280, heightMm: 350, offsetTopMm: 80 },
  },
  {
    garment: 'Classic Tee',
    color: 'White',
    preset: 'center-chest',
    printArea: { widthMm: 280, heightMm: 350, offsetTopMm: 80 },
  },
  {
    garment: 'Oversized Tee',
    color: 'Black',
    preset: 'monospace-operator',
    printArea: { widthMm: 300, heightMm: 400, offsetTopMm: 70 },
  },
];

// ---------------------------------------------------------------------------
// Seeding routine (idempotent via upsert on unique keys)
// ---------------------------------------------------------------------------

function skuFor(productSlug: string, v: VariantSeed): string {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${norm(productSlug)}-${norm(v.color)}-${norm(v.size)}-${norm(v.fit)}`.slice(0, 64);
}

async function main(): Promise<void> {
  // Collections
  const collectionIdBySlug = new Map<string, string>();
  for (const c of COLLECTIONS) {
    const row = await prisma.collection.upsert({
      where: { slug: c.slug },
      update: { title: c.title, sortOrder: c.sortOrder },
      create: { slug: c.slug, title: c.title, sortOrder: c.sortOrder },
    });
    collectionIdBySlug.set(c.slug, row.id);
  }

  // Products + Variants
  for (const p of PRODUCTS) {
    const collectionId = collectionIdBySlug.get(p.collectionSlug);
    if (collectionId === undefined) {
      throw new Error(`Seed error: unknown collection slug "${p.collectionSlug}"`);
    }

    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        slogan: p.slogan,
        tier: p.tier,
        collectionId,
        status: ProductStatus.PUBLISHED,
        basePrice: p.basePrice,
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
      },
      create: {
        slug: p.slug,
        slogan: p.slogan,
        tier: p.tier,
        collectionId,
        status: ProductStatus.PUBLISHED,
        basePrice: p.basePrice,
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
      },
    });

    for (const v of p.variants) {
      const sku = skuFor(p.slug, v);
      await prisma.variant.upsert({
        // Idempotent on the (productId, color, size, fit) tuple (Req 16.4).
        where: {
          productId_color_size_fit: {
            productId: product.id,
            color: v.color,
            size: v.size,
            fit: v.fit,
          },
        },
        update: {
          sku,
          stock: v.stock,
          priceOverride: v.priceOverride ?? null,
        },
        create: {
          productId: product.id,
          sku,
          color: v.color,
          size: v.size,
          fit: v.fit,
          stock: v.stock,
          priceOverride: v.priceOverride ?? null,
        },
      });
    }
  }

  // Slogan bank
  for (const s of SLOGANS) {
    await prisma.sloganBankEntry.upsert({
      where: { text: s.text },
      update: { tier: s.tier },
      create: { text: s.text, tier: s.tier },
    });
  }

  // Blank templates
  for (const t of BLANK_TEMPLATES) {
    await prisma.blankTemplate.upsert({
      where: {
        garment_color_preset: {
          garment: t.garment,
          color: t.color,
          preset: t.preset,
        },
      },
      update: { printArea: t.printArea },
      create: {
        garment: t.garment,
        color: t.color,
        preset: t.preset,
        printArea: t.printArea,
      },
    });
  }

  const [collections, products, variants, slogans, templates] = await Promise.all([
    prisma.collection.count(),
    prisma.product.count(),
    prisma.variant.count(),
    prisma.sloganBankEntry.count(),
    prisma.blankTemplate.count(),
  ]);

  // eslint-disable-next-line no-console
  console.log(
    `Seed complete: ${collections} collections, ${products} products, ` +
      `${variants} variants, ${slogans} slogans, ${templates} blank templates.`,
  );
}

main()
  .catch((e: unknown) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
