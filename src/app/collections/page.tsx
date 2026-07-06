/**
 * /collections — landing index listing active collections. Each links to its
 * own collection landing page (Req 2.9). Server-rendered so the initial HTML
 * carries the content and SEO metadata (Req 19.1).
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { absoluteUrl } from '@/lib/site';
import { getActiveCollections } from '@/server/shop-data';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return {
    title: 'Collections — Corporate Cult',
    description: 'Explore Corporate Cult collections and find your next favourite tee.',
    alternates: { canonical: absoluteUrl('/collections') },
  };
}

export default async function CollectionsPage() {
  const collections = await getActiveCollections();

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-black tracking-tight">Collections</h1>
        <p className="text-muted">Curated drops for every level of workplace honesty.</p>
      </header>

      {collections.length === 0 ? (
        <div
          role="status"
          className="flex min-h-40 flex-col items-center justify-center gap-2 border border-dashed border-ink/20 p-8 text-center"
        >
          <p className="text-lg font-bold">No collections yet</p>
          <p className="text-sm text-muted">Check back soon for new drops.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <li key={collection.slug} className="border border-ink/10">
              <Link
                href={`/collections/${collection.slug}`}
                className="flex flex-col gap-2 p-4"
              >
                <div className="aspect-video w-full bg-ink/5 relative overflow-hidden" aria-hidden="true">
                  {collection.heroImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={collection.heroImage}
                      alt={collection.title}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full bg-ink/5" />
                  )}
                </div>
                <span className="text-lg font-bold">{collection.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
