'use client';

import { useEffect, useState } from 'react';

export function CouponPopup() {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Check if the popup has already been shown to this user
    const hasBeenShown = localStorage.getItem('coupon-popup-shown');
    if (!hasBeenShown) {
      // Delay showing the popup for 2.5 seconds for a classy entry
      const timer = setTimeout(() => {
        setShow(true);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem('coupon-popup-shown', 'true');
    setShow(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText('STAKEHOLDER10');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity duration-300">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coupon-title"
        className="w-full max-w-md border border-ink bg-paper p-6 shadow-2xl transition-all duration-300 transform scale-100"
      >
        {/* Close Corner Button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-ink/60 hover:text-ink text-sm font-mono transition-colors"
          aria-label="Close dialog"
        >
          ✕
        </button>

        {/* Brand Header */}
        <div className="text-center mb-6">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted block mb-1">
            Budget Optimization Sync
          </span>
          <h2 id="coupon-title" className="text-2xl font-black uppercase tracking-tight text-ink">
            Join the Cult
          </h2>
        </div>

        {/* Promo Message */}
        <p className="text-sm text-ink/80 text-center mb-6 leading-relaxed normal-case">
          We appreciate your dedication to alignment. Apply this SOW code at checkout to receive a 10% budget optimization on your first streetwear asset allocation.
        </p>

        {/* Code Box */}
        <div className="flex flex-col gap-2.5 mb-6">
          <div className="flex items-center justify-between border border-ink/20 bg-ink/5 p-3 rounded">
            <span className="font-mono font-bold text-sm tracking-wider text-ink select-all">
              STAKEHOLDER10
            </span>
            <button
              onClick={handleCopy}
              className="bg-ink text-paper px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-ink/80 transition-colors rounded"
            >
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleClose}
          className="w-full bg-highlighter hover:bg-highlighter/95 text-ink py-3 text-xs font-black uppercase tracking-wider transition-colors rounded border border-ink/10"
        >
          Acknowledge SOW &amp; Enter Shop
        </button>

        <p className="text-[9px] text-muted text-center mt-3 font-mono">
          * Valid for new stakeholders only. Terms &amp; conditions apply.
        </p>
      </div>
    </div>
  );
}
