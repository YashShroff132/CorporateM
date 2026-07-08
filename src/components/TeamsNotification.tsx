'use client';

import { useEffect, useState } from 'react';

export function playTeamsPing() {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    
    // MS Teams tone is a quick two-tone bell sequence (around 850Hz and 600Hz)
    // First high-pitched quick beep
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(850, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.08);
    
    // Second lower tone playing immediately after
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(600, now + 0.08);
    gain2.gain.setValueAtTime(0.12, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.25);
  } catch (err) {
    console.error('[WebAudio] Teams sound synthesis failed:', err);
  }
}

export function triggerTeamsNotification(message?: string) {
  if (typeof window === 'undefined') return;
  const event = new CustomEvent('show-teams-notification', { detail: message });
  window.dispatchEvent(event);
}

export function TeamsNotification() {
  const [toast, setToast] = useState<{ message: string; show: boolean } | null>(null);

  useEffect(() => {
    const handleNotification = (e: Event) => {
      const customEvent = e as CustomEvent;
      const text = customEvent.detail || "I noticed you added an action item. Let's make sure we double-click on this before EOD.";
      
      playTeamsPing();
      setToast({ message: text, show: true });

      // Automatically hide the notification after 5 seconds
      const timer = setTimeout(() => {
        setToast((prev) => (prev ? { ...prev, show: false } : null));
      }, 5000);

      return () => clearTimeout(timer);
    };

    window.addEventListener('show-teams-notification', handleNotification);
    return () => window.removeEventListener('show-teams-notification', handleNotification);
  }, []);

  if (!toast || !toast.show) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-50 w-80 rounded border border-[#e1dfdd] bg-white shadow-xl transition-all duration-300 transform translate-y-0"
    >
      {/* Teams Header Bar */}
      <div className="flex items-center justify-between bg-[#6264a7] px-3 py-1.5 text-white rounded-t">
        <div className="flex items-center gap-1.5">
          {/* Custom minimal Teams logo */}
          <svg
            className="h-4.5 w-4.5 fill-current"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm-1.8 4a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zm3.6 0a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zm-3.6 6c-2.4 0-4 1.4-4 3.5v.5h16v-.5c0-2.1-1.6-3.5-4-3.5H10.2z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-wider font-sans">Microsoft Teams</span>
        </div>
        <button
          onClick={() => setToast(null)}
          className="text-white/80 hover:text-white text-xs font-mono"
          aria-label="Dismiss notification"
        >
          ✕
        </button>
      </div>

      {/* Teams Message Body */}
      <div className="flex items-start gap-3 p-3.5">
        {/* Boss circular avatar icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-between rounded-full bg-[#f3f2f1] text-[#6264a7] font-bold border border-[#e1dfdd] text-sm justify-center">
          BS
        </div>
        
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-ink">Boss (Vibe Manager)</span>
          <p className="text-[11px] text-ink/80 leading-relaxed font-sans normal-case">
            &ldquo;{toast.message}&rdquo;
          </p>
          <span className="text-[9px] text-muted uppercase mt-1 tracking-wider">Just now · Chat</span>
        </div>
      </div>
    </div>
  );
}
