import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DEFAULT_SORT,
  parseShopQuery,
  createShopQueryParser,
  getShopPage,
  type ShopProductView,
} from '@/services/shop';
import { ProductGrid } from './ProductGrid';
import { ShopView } from './ShopView';

/**
 * Unit tests for shop page defaults and empty state (task 4.4).
 *
 * These cover two concrete behaviours from Requirement 2:
 * - The default sort is "newest" when no sort param is present (Req 2.2).
 * - The empty-state message renders while the filter controls stay visible
 *   when no products match (Req 2.7).
 *
 * The shop components are server components (pure functions returning JSX with
 * no client interactivity), so they are rendered to static HTML with
 * `renderToStaticMarkup` rather than a client testing library.
 */

// ---------------------------------------------------------------------------
// Default sort = newest (Req 2.2)
// ---------------------------------------------------------------------------

describe('shop query default sort', () => {
  it('defaults sort to "newest" when no sort param is present', () => {
    const query = parseShopQuery(new URLSearchParams(''));
    expect(query.sort).toBe('newest');
    expect(DEFAULT_SORT).toBe('newest');
  });

  it('defaults sort to "newest" when only non-sort params are present', () => {
    const query = parseShopQuery(new URLSearchParams('color=black&page=2'));
    expect(query.sort).toBe('newest');
  });

  it('defaults sort to "newest" when the sort param is unrecognized', () => {
    const query = parseShopQuery(new URLSearchParams('sort=cheapest'));
    expect(query.sort).toBe('newest');
  });

  it('keeps a valid explicit sort selection', () => {
    const query = parseShopQuery(new URLSearchParams('sort=priceAsc'));
    expect(query.sort).toBe('priceAsc');
  });

  it('parser instance resolves the same default sort', () => {
    const parser = createShopQueryParser();
    expect(parser.parse(new URLSearchParams('')).sort).toBe('newest');
  });
});

// ---------------------------------------------------------------------------
// Empty-state rendering (Req 2.7)
// ---------------------------------------------------------------------------

describe('ProductGrid empty state', () => {
  it('renders the default empty-state message when there are no products', () => {
    const html = renderToStaticMarkup(<ProductGrid items={[]} />);
    expect(html).toContain('No matching products');
    // The status region makes the empty state announce itself to assistive tech.
    expect(html).toContain('role="status"');
  });

  it('renders a custom empty-state message when provided', () => {
    const html = renderToStaticMarkup(
      <ProductGrid items={[]} emptyMessage="Nothing matches those filters." />,
    );
    expect(html).toContain('Nothing matches those filters.');
  });

  it('renders product cards instead of the empty state when items exist', () => {
    const items: ShopProductView[] = [
      {
        id: 'p1',
        slug: 'the-quiet-quitter',
        slogan: 'The Quiet Quitter',
        tier: 'SAFE',
        collectionSlug: 'operator',
        colors: ['black'],
        sizes: ['M'],
        priceInr: 799,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        unitsSold: 0,
      },
    ];
    const html = renderToStaticMarkup(<ProductGrid items={items} />);
    expect(html).not.toContain('No matching products');
    expect(html).toContain('operator');
    expect(html).toContain('799');
    // The card shows the slogan and links to the product detail page.
    expect(html).toContain('The Quiet Quitter');
    expect(html).toContain('href="/product/the-quiet-quitter"');
  });
});

// ---------------------------------------------------------------------------
// Empty state retains filter controls within the full shop view (Req 2.7)
// ---------------------------------------------------------------------------

describe('ShopView empty state retains filter controls', () => {
  it('shows the empty-state message and keeps the filter controls visible', () => {
    const query = parseShopQuery(new URLSearchParams(''));
    // No products match, so getShopPage returns an empty page.
    const page = getShopPage([], query);
    expect(page.items).toHaveLength(0);

    const html = renderToStaticMarkup(
      <ShopView
        heading="Shop"
        basePath="/shop"
        baseQuery=""
        query={query}
        page={page}
        colors={['black', 'white']}
        sizes={['S', 'M', 'L']}
      />,
    );

    // Empty-state message is present.
    expect(html).toContain('No matching products');
    // Filter form and its controls remain mounted (Req 2.7).
    expect(html).toContain('aria-label="Product filters"');
    expect(html).toContain('Apply filters');
    // Facet controls discovered from the catalog are still rendered.
    expect(html).toContain('name="color"');
    expect(html).toContain('name="size"');
    expect(html).toContain('name="sort"');
    // The sort control reflects the default "newest" selection.
    expect(html).toContain('Newest');
  });
});
