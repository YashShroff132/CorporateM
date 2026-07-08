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
      }, 2500);
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
    navigator.clipboard.writeText('STAKEHOLDER10');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* ── Floating "10% OFF" Badge (Left Side) ── */}
      {showBadge && !showPopup && (
        <button
          onClick={handleBadgeClick}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-40 bg-stamp-red text-paper px-2.5 py-4 text-[10px] font-black uppercase tracking-widest rounded-r-lg shadow-lg hover:bg-stamp-red/90 transition-all duration-300 hover:px-3"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          aria-label="Open 10% discount offer"
        >
          10% Off
        </button>
      )}

      {/* ── Full-Screen Coupon Modal ── */}
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="coupon-title"
            className="relative w-full max-w-sm border border-ink bg-paper p-8 shadow-2xl rounded-lg"
          >
            {/* Close Corner Button */}
            <button
              onClick={handleClose}
              className="absolute right-3 top-3 text-ink/40 hover:text-ink text-lg font-mono leading-none transition-colors"
              aria-label="Close dialog"
            >
              &times;
            </button>

            {/* Header */}
            <div className="text-center mb-5">
              <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-muted block mb-2">
                New Stakeholder Onboarding
              </span>
              <h2
                id="coupon-title"
                className="text-3xl font-black uppercase tracking-tight text-ink leading-none"
              >
                Welcome to<br />the Cult
              </h2>
            </div>

            {/* Promo Message */}
            <p className="text-sm text-ink/70 text-center mb-6 leading-relaxed">
              As part of your onboarding, here&apos;s a <strong className="text-ink">10% budget allocation</strong> for your first streetwear requisition. Apply at checkout.
            </p>

            {/* Code Box */}
            <div className="flex items-center justify-between border-2 border-dashed border-ink/30 bg-ink/5 p-3.5 rounded-md mb-5">
              <span className="font-mono font-black text-base tracking-widest text-ink select-all">
                STAKEHOLDER10
              </span>
              <button
                onClick={handleCopy}
                className="bg-ink text-paper px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider hover:bg-ink/80 transition-colors rounded"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {/* CTA */}
            <button
              onClick={handleClose}
              className="w-full bg-highlighter hover:bg-highlighter/90 text-ink py-3 text-xs font-black uppercase tracking-wider transition-colors rounded border border-ink/10"
            >
              Start Shopping
            </button>

            <p className="text-[8px] text-muted text-center mt-3 font-mono tracking-wide">
              Valid on your first order. Cannot be combined with other offers.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
