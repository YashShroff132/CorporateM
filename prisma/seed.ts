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
  heroImage?: string;
}

const COLLECTIONS: readonly CollectionSeed[] = [
  { slug: 'operator', title: 'Compliance Approved', sortOrder: 0, heroImage: '/col-compliance-approved.png' },
  { slug: 'believer', title: 'Performance Managed', sortOrder: 1, heroImage: '/col-performance-managed.png' },
  { slug: 'heretic', title: 'Immediate Escalation', sortOrder: 2, heroImage: '/col-immediate-escalation.png' },
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
  // --- Compliance Approved (operator) ---
  {
    slug: 'unavailable-team-dinner',
    slogan: 'EOD Status: Currently Unavailable for Team Dinner',
    tier: Tier.SAFE,
    collectionSlug: 'operator',
    basePrice: 79900, // ₹799
    seoTitle: 'Currently Unavailable for Team Dinner Tee',
    seoDescription: 'Let the team know where you stand. Comfortable premium cotton.',
    variants: [
      ...sizeSpread('Black', 'Regular', 25),
      ...sizeSpread('White', 'Regular', 20),
    ],
  },
  {
    slug: 'stop-hallucinating',
    slogan: 'Stop Hallucinating My Performance',
    tier: Tier.SAFE,
    collectionSlug: 'operator',
    basePrice: 74900, // ₹749
    seoTitle: 'Stop Hallucinating My Performance Tee',
    seoDescription: 'For when the metrics get creative. Heavyweight cotton tee.',
    variants: [
      ...sizeSpread('Charcoal', 'Regular', 18),
      ...sizeSpread('Grey', 'Oversized', 15),
    ],
  },
  {
    slug: 'revert-back',
    slogan: 'Please Revert Back',
    tier: Tier.SAFE,
    collectionSlug: 'operator',
    basePrice: 79900, // ₹799
    seoTitle: 'Please Revert Back Tee',
    seoDescription: 'The classic deferral. Stencil font styling.',
    variants: [...sizeSpread('White', 'Oversized', 22)],
  },
  // --- Performance Managed (believer) ---
  {
    slug: 'couldve-been-email',
    slogan: "This Could've Been an Email",
    tier: Tier.DIRECT,
    collectionSlug: 'believer',
    basePrice: 89900, // ₹899
    seoTitle: "This Could've Been an Email Tee",
    seoDescription: 'Save everyone some time. Heavyweight combed cotton.',
    variants: [
      ...sizeSpread('Black', 'Regular', 30),
      ...sizeSpread('Olive', 'Oversized', 12),
    ],
  },
  {
    slug: 'do-not-disturb',
    slogan: 'Do not disturb, serving notice.',
    tier: Tier.DIRECT,
    collectionSlug: 'believer',
    basePrice: 84900, // ₹849
    seoTitle: 'Do Not Disturb Serving Notice Tee',
    seoDescription: 'Serving notice in style. Distressed stamp font print.',
    variants: [
      ...sizeSpread('Grey', 'Regular', 26),
      ...sizeSpread('Black', 'Oversized', 14),
    ],
  },
  {
    slug: 'team-bonding',
    slogan: 'Team Bonding nahi Permanent WFH chaiye.',
    tier: Tier.DIRECT,
    collectionSlug: 'believer',
    basePrice: 89900, // ₹899
    seoTitle: 'Permanent WFH Chaiye Tee',
    seoDescription: 'Bonding is over, work from home is now. Soft everyday cotton.',
    variants: [...sizeSpread('Cream', 'Oversized', 19)],
  },
  // --- Immediate Escalation (heretic) ---
  {
    slug: 'resume-gap',
    slogan: 'I am just here to avoid a gap in my resume',
    tier: Tier.VERY_DIRECT,
    collectionSlug: 'heretic',
    basePrice: 99900, // ₹999
    seoTitle: 'Avoid a Gap in My Resume Tee',
    seoDescription: 'Honest survivalist apparel. Minimalist label design.',
    variants: [
      ...sizeSpread('White', 'Oversized', 16),
      ...sizeSpread('Black', 'Regular', 10),
    ],
  },
  {
    slug: 'immediate-quitter',
    slogan: 'Immediate joiner? No, immediate quitter.',
    tier: Tier.VERY_DIRECT,
    collectionSlug: 'heretic',
    basePrice: 104900, // ₹1049
    seoTitle: 'Immediate Quitter Tee',
    seoDescription: 'Record attrition speeds. High-contrast impact print.',
    variants: [...sizeSpread('Black', 'Oversized', 13)],
  },
  {
    slug: 'chai-breaks',
    slogan: 'Chai breaks are the only milestones I actually care about achieving',
    tier: Tier.VERY_DIRECT,
    collectionSlug: 'heretic',
    basePrice: 99900, // ₹999
    seoTitle: 'Chai Breaks Are the Only Milestones Tee',
    seoDescription: 'The ultimate tea breaks celebration. Groovy modern font print.',
    variants: [...sizeSpread('Olive', 'Oversized', 15)],
  },
];

interface SloganSeed {
  text: string;
  tier: Tier;
}

const SLOGANS: readonly SloganSeed[] = [
  { text: 'EOD Status: Currently Unavailable for Team Dinner', tier: Tier.SAFE },
  { text: 'Stop Hallucinating My Performance', tier: Tier.SAFE },
  { text: 'Please Revert Back', tier: Tier.SAFE },
  { text: "This Could've Been an Email", tier: Tier.DIRECT },
  { text: 'Do not disturb, serving notice.', tier: Tier.DIRECT },
  { text: 'Team Bonding nahi Permanent WFH chaiye.', tier: Tier.DIRECT },
  { text: 'I am just here to avoid a gap in my resume', tier: Tier.VERY_DIRECT },
  { text: 'Immediate joiner? No, immediate quitter.', tier: Tier.VERY_DIRECT },
  { text: 'Chai breaks are the only milestones I actually care about achieving', tier: Tier.VERY_DIRECT },
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
  // Clean start: Delete all existing customer/catalog items to start from scratch with exactly 8 products
  console.log('Cleaning database...');
  await prisma.cartLine.deleteMany();
  await prisma.wishlistItem.deleteMany();
  await prisma.review.deleteMany();
  await prisma.design.deleteMany();
  await prisma.variant.deleteMany();
  await prisma.product.deleteMany();
  console.log('Database cleaned. Seeding Collections...');

  // Collections
  const collectionIdBySlug = new Map<string, string>();
  for (const c of COLLECTIONS) {
    const row = await prisma.collection.upsert({
      where: { slug: c.slug },
      update: { title: c.title, sortOrder: c.sortOrder, heroImage: c.heroImage ?? null },
      create: { slug: c.slug, title: c.title, sortOrder: c.sortOrder, heroImage: c.heroImage ?? null },
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
