/**
 * Prisma seed script — Out of Office.
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
  { slug: 'operator', title: 'Drop 1', sortOrder: 0, heroImage: '/products/employee-resign-full.jpg' },
  { slug: 'believer', title: 'Drop 2', sortOrder: 1, heroImage: '/products/snake-coworkers-full.jpg' },
  { slug: 'heretic', title: 'Drop 3', sortOrder: 2, heroImage: '/products/am-i-audible-full.jpg' },
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
  basePrice: number;
  seoTitle: string;
  seoDescription: string;
  mockupUrl?: string;
  mockupBackUrl?: string;
  galleryUrls?: readonly string[];
  variants: readonly VariantSeed[];
}

/** A small, reusable size/fit spread for a given colour. */
function sizeSpread(color: string, fit: string, stock: number): VariantSeed[] {
  return (['S', 'M', 'L', 'XL', 'XXL'] as const).map((size) => ({
    color,
    size,
    fit,
    stock,
  }));
}

const PRODUCTS: readonly ProductSeed[] = [
  {
    slug: 'employee-resigns',
    slogan: 'An employee who does not give up resigns.',
    tier: Tier.SAFE,
    collectionSlug: 'operator',
    basePrice: 79900, // ₹799
    mockupUrl: '/products/employee-resign-full.jpg',
    galleryUrls: ['/products/employee-resign-ad.jpg'],
    seoTitle: 'An Employee Who Does Not Give Up Resigns Tee',
    seoDescription: 'Heavyweight oversized cotton tee — the corporate anthem for anyone who has ever rage-quit in style.',
    variants: [
      ...sizeSpread('Black', 'Oversized', 30),
    ],
  },
  {
    slug: 'like-a-family-here',
    slogan: 'LIKE A FAMILY HERE* *LAYOFFS EXCLUDED.',
    tier: Tier.SAFE,
    collectionSlug: 'operator',
    basePrice: 79900, // ₹799
    mockupUrl: '/products/like-a-family-full.jpg',
    galleryUrls: ['/products/like-a-family-here-ad.jpg'],
    seoTitle: 'Like a Family Here Layoffs Excluded Tee',
    seoDescription: 'Corporate culture satire graphic tee — because every town hall promises family until Q3 cuts.',
    variants: [
      ...sizeSpread('Black', 'Oversized', 25),
    ],
  },
  {
    slug: 'hybrid-mandatory',
    slogan: 'HYBRID 3 days mandatory',
    tier: Tier.DIRECT,
    collectionSlug: 'believer',
    basePrice: 84900, // ₹849
    mockupUrl: '/products/hybrid-mandatory-full.jpg',
    galleryUrls: ['/products/hybrid-mandatory-ad.jpg'],
    seoTitle: 'Hybrid 3 Days Mandatory Tee',
    seoDescription: 'Bold typographic back print about office mandates.',
    variants: [
      ...sizeSpread('Black', 'Oversized', 20),
    ],
  },
  {
    slug: 'delegator',
    slogan: 'DELEGATOR',
    tier: Tier.VERY_DIRECT,
    collectionSlug: 'heretic',
    basePrice: 99900, // ₹999
    mockupUrl: '/products/delegator-full.jpg',
    galleryUrls: ['/products/delegator-ad-1.png', '/products/delegator-ad-2.png', '/products/delegator-ad-3.png'],
    seoTitle: 'Delegator Ram Graphic Heavyweight Tee',
    seoDescription: 'Gold ram graphic back print — for every manager who delegates like a GOAT.',
    variants: [
      ...sizeSpread('Black', 'Oversized', 15),
    ],
  },
  {
    slug: 'wfh-over-wfo',
    slogan: 'WFH over WFO',
    tier: Tier.SAFE,
    collectionSlug: 'operator',
    basePrice: 74900, // ₹749
    mockupUrl: '/products/wfh-over-wfo-full.jpg',
    galleryUrls: ['/products/wfh-over-wfo-ad.png'],
    seoTitle: 'WFH Over WFO Graphic Tee',
    seoDescription: 'Work from home preference bold back print tee.',
    variants: [
      ...sizeSpread('Black', 'Oversized', 28),
    ],
  },
  {
    slug: '9am-standups-toxic',
    slogan: '9 AM STANDUPS GIVE TOXIC RELATIONSHIP VIBES',
    tier: Tier.DIRECT,
    collectionSlug: 'believer',
    basePrice: 89900, // ₹899
    mockupUrl: '/products/9am-standups-full.jpg',
    galleryUrls: ['/products/9am-standups-toxic-ad.png'],
    seoTitle: '9 AM Standups Give Toxic Relationship Vibes Tee',
    seoDescription: 'Morning standup culture called out in bold glitch typography on heavyweight black cotton.',
    variants: [
      ...sizeSpread('Black', 'Oversized', 22),
    ],
  },
  {
    slug: 'chai-sutta-break',
    slogan: 'CHAI SUTTA BREAK',
    tier: Tier.SAFE,
    collectionSlug: 'operator',
    basePrice: 79900, // ₹799
    mockupUrl: '/products/chai-sutta-break-full.jpg',
    galleryUrls: ['/products/chai-sutta-break-ad.jpg'],
    seoTitle: 'Chai Sutta Break Graphic Tee',
    seoDescription: 'The sacred office ritual — chai, sutta, and pretending the deadline is tomorrow.',
    variants: [
      ...sizeSpread('Black', 'Oversized', 25),
    ],
  },
  {
    slug: 'quick-call',
    slogan: 'QUICK CALL',
    tier: Tier.DIRECT,
    collectionSlug: 'believer',
    basePrice: 84900, // ₹849
    mockupUrl: '/products/quick-call-full.jpg',
    galleryUrls: ['/products/quick-call-ad.png'],
    seoTitle: 'Quick Call Exhaustion Graphic Tee',
    seoDescription: 'The meeting that should have been an email — repeated until insanity.',
    variants: [
      ...sizeSpread('Black', 'Oversized', 18),
    ],
  },
  {
    slug: 'snake-coworkers',
    slogan: 'BE AWARE OF SNAKE CO-WORKERS',
    tier: Tier.DIRECT,
    collectionSlug: 'believer',
    basePrice: 89900, // ₹899
    mockupUrl: '/products/snake-coworkers-full.jpg',
    galleryUrls: ['/products/snake-coworkers-ad.jpg'],
    seoTitle: 'Be Aware of Snake Co-Workers Tee',
    seoDescription: 'Heavyweight black cotton graphic tee with snake back print.',
    variants: [
      ...sizeSpread('Black', 'Oversized', 25),
    ],
  },
  {
    slug: 'sorry-late-claude',
    slogan: "I'm sorry I was late. I had a meeting.* (*I was talking to claude.)",
    tier: Tier.SAFE,
    collectionSlug: 'operator',
    basePrice: 79900, // ₹799
    mockupUrl: '/products/sorry-late-claude-full.jpg',
    galleryUrls: ['/products/sorry-late-claude-ad.png'],
    seoTitle: "I'm Sorry I Was Late I Was Talking to Claude Tee",
    seoDescription: 'AI meeting excuse typography heavyweight black tee.',
    variants: [
      ...sizeSpread('Black', 'Oversized', 30),
    ],
  },
  // ---- NEW PRODUCTS ----
  {
    slug: 'boyfriend-wfh',
    slogan: 'MY BOYFRIEND IS DOING WFH',
    tier: Tier.SAFE,
    collectionSlug: 'operator',
    basePrice: 79900, // ₹799
    mockupUrl: '/products/boyfriend-wfh-full.jpg',
    galleryUrls: ['/products/girlfriend-wfh-full.png', '/products/boyfriend-wfh-ad.jpg'],
    seoTitle: 'My Boyfriend Is Doing WFH Graphic White Tee',
    seoDescription: 'Chili pepper graphic white tee — because your boyfriend working from home hits different.',
    variants: [
      ...sizeSpread('White', 'Oversized', 25),
    ],
  },
  {
    slug: 'good-team-manager',
    slogan: 'GOOD TEAM MANAGER',
    tier: Tier.DIRECT,
    collectionSlug: 'believer',
    basePrice: 89900, // ₹899
    mockupUrl: '/products/good-team-manager-full.jpg',
    galleryUrls: ['/products/good-team-manager-ad.png'],
    seoTitle: 'Good Team Manager Moth Graphic Tee',
    seoDescription: 'Unread emails & pending approvals — the moth of management on heavyweight black cotton.',
    variants: [
      ...sizeSpread('Black', 'Oversized', 20),
    ],
  },
  {
    slug: 'happy-friday',
    slogan: 'HAPPY FRIDAY',
    tier: Tier.SAFE,
    collectionSlug: 'operator',
    basePrice: 79900, // ₹799
    mockupUrl: '/products/happy-friday-full.jpg',
    galleryUrls: ['/products/happy-friday-ad.jpg', '/products/happy-friday-white-ad.png'],
    seoTitle: 'Happy Friday Bold Graphic Tee',
    seoDescription: 'The only day that matters — bold Friday typography on heavyweight black cotton.',
    variants: [
      ...sizeSpread('Black', 'Oversized', 25),
    ],
  },
  {
    slug: 'manager-eyes',
    slogan: 'MANAGER',
    tier: Tier.VERY_DIRECT,
    collectionSlug: 'heretic',
    basePrice: 99900, // ₹999
    mockupUrl: '/products/manager-eyes-full.jpg',
    galleryUrls: ['/products/manager-eyes-ad.jpg'],
    seoTitle: 'Manager Gold Eyes Graphic Heavyweight Tee',
    seoDescription: 'Gold eyes watching — the manager sees everything, on heavyweight black cotton.',
    variants: [
      ...sizeSpread('Black', 'Oversized', 15),
    ],
  },
  {
    slug: 'notice-period-energy',
    slogan: 'NOTICE PERIOD ENERGY',
    tier: Tier.DIRECT,
    collectionSlug: 'believer',
    basePrice: 84900, // ₹849
    mockupUrl: '/products/notice-period-energy-full.jpg',
    galleryUrls: ['/products/notice-period-energy-ad-1.png', '/products/notice-period-energy-ad-2.png', '/products/notice-period-energy-ad-3.png'],
    seoTitle: 'Notice Period Energy Graphic Tee',
    seoDescription: 'Girl on couch vibes — notice period energy in bold red on heavyweight black cotton.',
    variants: [
      ...sizeSpread('Black', 'Oversized', 22),
    ],
  },
  {
    slug: 'mute-is-my-crown',
    slogan: 'MUTE IS MY CROWN',
    tier: Tier.SAFE,
    collectionSlug: 'operator',
    basePrice: 84900, // ₹849
    mockupUrl: '/products/mute-is-my-crown-full.jpg',
    galleryUrls: ['/products/mute-is-my-crown-ad.png'],
    seoTitle: 'Mute Is My Crown Queen Card White Tee',
    seoDescription: 'Queen of hearts playing card — mute is my crown, on premium white cotton.',
    variants: [
      ...sizeSpread('White', 'Oversized', 25),
    ],
  },
];

interface SloganSeed {
  text: string;
  tier: Tier;
}

const SLOGANS: readonly SloganSeed[] = [
  { text: 'An employee who does not give up resigns.', tier: Tier.SAFE },
  { text: 'LIKE A FAMILY HERE *layoffs excluded.', tier: Tier.SAFE },
  { text: 'HYBRID 3 days mandatory', tier: Tier.DIRECT },
  { text: 'DELEGATOR', tier: Tier.VERY_DIRECT },
  { text: 'WFH over WFO', tier: Tier.SAFE },
  { text: '9 AM STANDUPS GIVE TOXIC RELATIONSHIP VIBES', tier: Tier.DIRECT },
  { text: 'CHAI SUTTA BREAK', tier: Tier.SAFE },
  { text: 'QUICK CALL', tier: Tier.DIRECT },
  { text: 'BE AWARE OF SNAKE CO-WORKERS', tier: Tier.DIRECT },
  { text: "I'm sorry I was late. I had a meeting.* (*I was talking to claude.)", tier: Tier.SAFE },
  { text: 'MY BOYFRIEND IS DOING WFH', tier: Tier.SAFE },
  { text: 'GOOD TEAM MANAGER', tier: Tier.DIRECT },
  { text: 'HAPPY FRIDAY', tier: Tier.SAFE },
  { text: 'MANAGER', tier: Tier.VERY_DIRECT },
  { text: 'NOTICE PERIOD ENERGY', tier: Tier.DIRECT },
  { text: 'MUTE IS MY CROWN', tier: Tier.SAFE },
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
        mockupUrl: p.mockupUrl ?? null,
        mockupBackUrl: p.mockupBackUrl ?? null,
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
        mockupUrl: p.mockupUrl ?? null,
        mockupBackUrl: p.mockupBackUrl ?? null,
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
