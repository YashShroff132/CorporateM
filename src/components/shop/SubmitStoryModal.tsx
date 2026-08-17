'use client';

import { useState } from 'react';
import type { ShopProductView } from '@/services/shop';

interface SubmitStoryModalProps {
  products: readonly ShopProductView[];
  submitStoryAction: (formData: FormData) => Promise<{ success: boolean; message?: string }>;
}

export function SubmitStoryModal({ products, submitStoryAction }: SubmitStoryModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    const formData = new FormData(e.currentTarget);
    const res = await submitStoryAction(formData);

    setIsSubmitting(false);
    if (res.success) {
      setFeedback({ success: true, message: res.message || 'Story posted!' });
      setTimeout(() => {
        setIsOpen(false);
        setFeedback(null);
      }, 2000);
    } else {
      setFeedback({ success: false, message: res.message || 'Error posting story.' });
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center justify-center gap-2 bg-highlighter hover:bg-highlighter/90 text-ink font-black uppercase text-xs sm:text-sm tracking-wider px-5 py-3 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 active:scale-[0.99] cursor-pointer border border-ink/10"
      >
        <span>🔥 Post Your Toxic Boss Story</span>
        <span className="text-base leading-none">✍️</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg border-2 border-ink dark:border-white/30 bg-paper dark:bg-black p-6 sm:p-8 shadow-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
            {/* Top Accent Strip */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-stamp-red via-highlighter to-ink" />

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 h-8 w-8 flex items-center justify-center rounded-full bg-ink/5 dark:bg-white/10 text-ink/70 dark:text-white/70 hover:text-ink dark:hover:text-white hover:bg-ink/10 transition-colors"
            >
              ✕
            </button>

            <div className="mb-5 text-center mt-1">
              <span className="inline-block px-3 py-1 bg-stamp-red/10 text-stamp-red text-[10px] font-mono font-bold uppercase tracking-widest rounded-full mb-2">
                🔒 Confidential Confessional
              </span>
              <h2 className="text-2xl font-black uppercase tracking-tight text-ink dark:text-white leading-none">
                Confess Your <span className="text-stamp-red dark:text-highlighter">Toxic Boss Story</span>
              </h2>
              <p className="text-xs text-muted mt-1">
                Share what happened & which Out of Office shirt speaks your truth.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs font-mono">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="font-bold text-ink dark:text-white uppercase tracking-wider">Your Name / Alias</span>
                  <input
                    name="authorName"
                    placeholder="e.g. Anonymous Dev"
                    defaultValue="Anonymous Survivor"
                    className="border border-ink/20 dark:border-white/20 bg-paper dark:bg-black px-3 py-2 rounded-lg text-ink dark:text-white focus:outline-none focus:ring-1 focus:ring-ink dark:focus:ring-white"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-bold text-ink dark:text-white uppercase tracking-wider">Designation / Role</span>
                  <input
                    name="jobRole"
                    placeholder="e.g. Senior Tech Lead"
                    className="border border-ink/20 dark:border-white/20 bg-paper dark:bg-black px-3 py-2 rounded-lg text-ink dark:text-white focus:outline-none focus:ring-1 focus:ring-ink dark:focus:ring-white"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="font-bold text-ink dark:text-white uppercase tracking-wider">Relatable Tee Purchased / Liked</span>
                <select
                  name="sloganSlug"
                  className="border border-ink/20 dark:border-white/20 bg-paper dark:bg-black px-3 py-2 rounded-lg text-ink dark:text-white focus:outline-none focus:ring-1 focus:ring-ink dark:focus:ring-white"
                >
                  <option value="">-- Select a Tee Slogan --</option>
                  {products.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.slogan}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink dark:text-white uppercase tracking-wider">Order ID (Optional)</span>
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold">Get Verified Survivor 🏷️ Badge</span>
                </div>
                <input
                  name="orderId"
                  placeholder="e.g. ORD-1723..."
                  className="border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 rounded-lg text-ink dark:text-white uppercase focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="font-bold text-ink dark:text-white uppercase tracking-wider">The Story / Encounter</span>
                <textarea
                  name="storyText"
                  required
                  rows={4}
                  placeholder="What did your boss say or do? Why did you need an Out of Office shirt?"
                  className="border border-ink/20 dark:border-white/20 bg-paper dark:bg-black p-3 rounded-lg text-ink dark:text-white focus:outline-none focus:ring-1 focus:ring-ink dark:focus:ring-white leading-relaxed"
                />
              </label>

              {feedback && (
                <div
                  className={`p-3 rounded-lg text-xs font-bold text-center ${
                    feedback.success
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-stamp-red/15 border border-stamp-red/30 text-stamp-red'
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-ink dark:bg-white text-paper dark:text-black py-3.5 text-xs font-black uppercase tracking-wider rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity mt-1 cursor-pointer"
              >
                {isSubmitting ? 'Publishing Story...' : 'Publish Story to Wall →'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
