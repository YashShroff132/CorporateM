'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ToxicStoryItem } from '@/server/stories-data';
import type { ShopProductView } from '@/services/shop';
import { SubmitStoryModal } from '@/components/shop/SubmitStoryModal';

interface CorporateConfessionsWallProps {
  stories: readonly ToxicStoryItem[];
  products: readonly ShopProductView[];
  submitStoryAction: (formData: FormData) => Promise<{ success: boolean; message?: string }>;
  upvoteStoryAction: (formData: FormData) => Promise<void>;
}

export function CorporateConfessionsWall({
  stories: initialStories,
  products,
  submitStoryAction,
  upvoteStoryAction,
}: CorporateConfessionsWallProps) {
  const [stories, setStories] = useState<readonly ToxicStoryItem[]>(initialStories);
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});

  const handleUpvote = async (storyId: string) => {
    if (likedIds[storyId]) return;

    setLikedIds((prev) => ({ ...prev, [storyId]: true }));
    setStories((prev) =>
      prev.map((s) => (s.id === storyId ? { ...s, likesCount: s.likesCount + 1 } : s)),
    );

    const formData = new FormData();
    formData.append('storyId', storyId);
    await upvoteStoryAction(formData);
  };

  const getProductForSlug = (slug: string | null) => {
    if (!slug) return null;
    return products.find((p) => p.slug === slug) || null;
  };

  return (
    <section aria-label="Corporate Confessions Wall" className="flex flex-col gap-6 py-12 border-t border-ink/10 dark:border-white/10">
      {/* Header & Modal CTA */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex flex-col gap-2 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="bg-stamp-red text-paper px-2.5 py-0.5 text-[10px] font-mono font-black uppercase tracking-widest rounded">
              🔥 Boss Hall of Shame
            </span>
            <span className="text-xs font-mono font-bold text-muted uppercase">Community Stories</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-ink dark:text-white leading-none">
            Wall of Corporate Confessions
          </h2>
          <p className="text-xs sm:text-sm text-muted">
            Unfiltered stories from employees and verified buyers about toxic boss encounters, 9 AM standup wars, and the Out of Office tees that got them through it.
          </p>
        </div>

        <SubmitStoryModal products={products} submitStoryAction={submitStoryAction} />
      </div>

      {/* Confessions Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-2">
        {stories.map((story) => {
          const linkedProduct = getProductForSlug(story.sloganSlug);
          const isLiked = likedIds[story.id];

          return (
            <article
              key={story.id}
              className="relative flex flex-col justify-between p-5 rounded-2xl border-2 border-ink/20 dark:border-white/25 bg-paper dark:bg-black/90 text-ink dark:text-white shadow-md hover:shadow-lg hover:border-ink/50 dark:hover:border-white/50 transition-all duration-200 group overflow-hidden"
            >
              {/* Top Card Header */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 border-b border-ink/15 dark:border-white/15 pb-3">
                  <div className="flex flex-col">
                    <span className="font-extrabold text-sm text-ink dark:text-white group-hover:text-stamp-red transition-colors">
                      {story.authorName}
                    </span>
                    {story.jobRole && (
                      <span className="text-[10px] font-mono text-ink/60 dark:text-white/60 font-semibold uppercase tracking-wider">
                        {story.jobRole}
                      </span>
                    )}
                  </div>

                  {story.verifiedBuyer ? (
                    <span className="inline-flex items-center gap-1 bg-emerald-700 text-white dark:bg-emerald-400 dark:text-black px-2.5 py-1 rounded text-[10px] font-mono font-extrabold uppercase tracking-wider shadow-xs">
                      <span>🏷️ Verified Survivor</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-amber-700 text-white dark:bg-amber-400 dark:text-black px-2.5 py-1 rounded text-[10px] font-mono font-extrabold uppercase tracking-wider shadow-xs">
                      <span>💬 Confession</span>
                    </span>
                  )}
                </div>

                {/* Story Body Quote */}
                <p className="text-xs sm:text-sm text-ink/90 dark:text-white/90 leading-relaxed font-sans italic font-medium">
                  &ldquo;{story.storyText}&rdquo;
                </p>
              </div>

              {/* Card Footer: Product Link & Upvote Button */}
              <div className="flex items-center justify-between gap-2 mt-5 pt-3 border-t border-ink/15 dark:border-white/15 font-mono text-xs">
                {linkedProduct ? (
                  <Link
                    href={`/product/${linkedProduct.slug}`}
                    className="inline-flex items-center gap-1 text-[11px] font-extrabold text-ink dark:text-white hover:text-stamp-red dark:hover:text-highlighter transition-colors truncate max-w-[65%]"
                  >
                    <span>👕</span>
                    <span className="truncate">{linkedProduct.slogan}</span>
                  </Link>
                ) : (
                  <span className="text-[10px] text-ink/60 dark:text-white/60 font-bold uppercase">Out of Office Club</span>
                )}

                <button
                  type="button"
                  onClick={() => handleUpvote(story.id)}
                  disabled={isLiked}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all duration-150 cursor-pointer ${
                    isLiked
                      ? 'bg-stamp-red text-white scale-105 shadow-sm'
                      : 'bg-ink/10 dark:bg-white/15 text-ink dark:text-white hover:bg-ink/20 dark:hover:bg-white/25 border border-ink/10 dark:border-white/10'
                  }`}
                >
                  <span>Relate 💀</span>
                  <span>{story.likesCount}</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
