import type { Metadata } from 'next';
import { absoluteUrl } from '@/lib/site';
import { getPublishedShopProducts } from '@/server/shop-data';
import { loadPublishedStories, submitStoryAction, upvoteStoryAction } from '@/server/stories-data';
import { CorporateConfessionsWall } from '@/components/homepage/CorporateConfessionsWall';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return {
    title: 'Corporate Confessions',
    description: 'Explore toxic boss stories and workplace confessions from corporate survivors.',
    alternates: { canonical: absoluteUrl('/collections') },
  };
}

export default async function CollectionsPage() {
  const products = await getPublishedShopProducts();
  const stories = await loadPublishedStories();

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-black tracking-tight">Corporate Confessions</h1>
        <p className="text-muted">Unfiltered stories from corporate survivors, 9 AM standup chaos, and toxic boss encounters.</p>
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
