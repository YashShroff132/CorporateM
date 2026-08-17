'use client';

import { useEffect, useState } from 'react';

export function CouponPopup() {
  const [showPopup, setShowPopup] = useState(false);
  const [showBadge, setShowBadge] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const hasBeenShown = localStorage.getItem('coupon-popup-shown');
    if (hasBeenShown) {
      // Returning user — show the floating badge immediately
      setShowBadge(true);
    } else {
      // First visit — show popup after a short delay
      const timer = setTimeout(() => {
        setShowPopup(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem('coupon-popup-shown', 'true');
    setShowPopup(false);
    setShowBadge(true);
  };

  const handleBadgeClick = () => {
    setShowPopup(true);
    setShowBadge(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText('OOO10');
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <>
      {/* ── Floating "10% OFF" Badge (Left Side) ── */}
      {showBadge && !showPopup && (
        <button
          onClick={handleBadgeClick}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-40 bg-stamp-red text-paper px-3 py-4 text-[11px] font-black uppercase tracking-widest rounded-r-xl shadow-xl hover:bg-stamp-red/90 transition-all duration-300 hover:px-4 cursor-pointer"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          aria-label="Open 10% discount offer"
        >
          🎁 10% OFF
        </button>
      )}

      {/* ── Full-Screen Coupon Modal ── */}
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-in fade-in duration-300">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="coupon-title"
            className="relative w-full max-w-sm border-2 border-ink dark:border-white/30 bg-paper dark:bg-black p-7 shadow-2xl rounded-2xl overflow-hidden"
          >
            {/* Close Corner Button */}
            <button
              onClick={handleClose}
              className="absolute right-4 top-4 h-7 w-7 flex items-center justify-center rounded-full bg-ink/5 dark:bg-white/10 text-ink/70 dark:text-white/70 hover:text-ink dark:hover:text-white hover:bg-ink/10 transition-colors"
              aria-label="Close dialog"
            >
              ✕
            </button>

            {/* Header */}
            <div className="text-center mt-2 mb-4">
              <span className="inline-block px-3 py-1 bg-highlighter/30 text-ink text-[10px] font-mono font-bold uppercase tracking-widest rounded-full mb-3">
                🔥 Exclusive Offer
              </span>
              <h2
                id="coupon-title"
                className="text-3xl font-black uppercase tracking-tight text-ink dark:text-white leading-none"
              >
                You&apos;re Now<br />
                <span className="text-stamp-red dark:text-highlighter">Out of Office</span>
              </h2>
            </div>

            {/* Promo Message */}
            <p className="text-xs text-ink/80 dark:text-white/80 text-center mb-5 leading-relaxed">
              Your auto-reply is set! Take <strong className="text-ink dark:text-white font-black text-sm">10% OFF</strong> your first order. Apply code at checkout before you clock back in.
            </p>

            {/* Code Box */}
            <div className="flex items-center justify-between border-2 border-dashed border-ink/40 dark:border-white/40 bg-ink/5 dark:bg-white/5 p-3.5 rounded-xl mb-5">
              <div className="flex flex-col">
                <span className="text-[9px] font-mono text-muted uppercase tracking-wider">Coupon Code</span>
                <span className="font-mono font-black text-lg tracking-widest text-ink dark:text-white select-all">
                  OOO10
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className={`px-4 py-2 text-xs font-black uppercase tracking-wider transition-all duration-200 rounded-lg cursor-pointer ${
                  copied
                    ? 'bg-emerald-600 text-white shadow-sm scale-105'
                    : 'bg-ink dark:bg-white text-paper dark:text-black hover:opacity-90'
                }`}
              >
                {copied ? '✓ Copied!' : 'Copy Code'}
              </button>
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={handleClose}
              className="w-full bg-highlighter hover:bg-highlighter/90 text-ink py-3.5 text-xs font-black uppercase tracking-wider transition-all duration-200 rounded-xl shadow-md hover:shadow-lg active:scale-[0.99] border border-ink/10 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Start Shopping</span>
              <span className="text-base leading-none">→</span>
            </button>

            <p className="text-[9px] text-muted text-center mt-3 font-mono tracking-wide">
              Valid on your first order. Automatic 10% discount at checkout.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
