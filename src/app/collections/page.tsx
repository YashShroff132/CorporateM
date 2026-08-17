import type { Metadata } from 'next';
import { absoluteUrl } from '@/lib/site';
import { getPublishedShopProducts } from '@/server/shop-data';
import { loadPublishedStories, submitStoryAction, upvoteStoryAction } from '@/server/stories-data';
import { CorporateConfessionsWall } from '@/components/homepage/CorporateConfessionsWall';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return {
    title: 'Corporate Confessions & Drops',
    description: 'Explore toxic boss stories, employee confessions, and Out of Office drops.',
    alternates: { canonical: absoluteUrl('/collections') },
  };
}

export default async function CollectionsPage() {
  const products = await getPublishedShopProducts();
  const stories = await loadPublishedStories();

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-black tracking-tight">Drops & Corporate Confessions</h1>
        <p className="text-muted">Real stories from corporate survivors and curated drops for every level of workplace honesty.</p>
      </header>

      <CorporateConfessionsWall
        stories={stories}
        products={products}
        submitStoryAction={submitStoryAction}
        upvoteStoryAction={upvoteStoryAction}
      />
    </main>
  );
}
