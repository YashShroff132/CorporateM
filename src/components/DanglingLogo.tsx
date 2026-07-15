'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OOOLogo } from './OOOLogo';

/**
 * DanglingLogo — an interactive 3D pendulum version of the OOO logo.
 *
 * The logo auto-swings like a pendulum from a fixed pivot point at the top.
 * - Click/tap to stop the swing and "grab" the logo
 * - Drag to manually rotate it
 * - Click/tap again (or release) to resume swinging
 *
 * Uses pure CSS 3D transforms + minimal JS — zero external dependencies.
 */
export function DanglingLogo() {
  const [isSwinging, setIsSwinging] = useState(true);
  const [manualAngle, setManualAngle] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startAngle = useRef(0);

  const handleClick = useCallback(() => {
    if (isDragging.current) return; // Don't toggle on drag release
    setIsSwinging((prev) => !prev);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isSwinging) {
        setIsSwinging(false);
      }
      isDragging.current = false;
      startX.current = e.clientX;
      startAngle.current = manualAngle;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [isSwinging, manualAngle],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.buttons === 0) return;
      const dx = e.clientX - startX.current;
      if (Math.abs(dx) > 3) isDragging.current = true;
      // Map horizontal drag to rotation: 1px = 0.5deg
      const newAngle = startAngle.current + dx * 0.5;
      // Clamp to realistic pendulum range
      setManualAngle(Math.max(-45, Math.min(45, newAngle)));
    },
    [],
  );

  const handlePointerUp = useCallback(() => {
    if (isDragging.current) {
      // On drag release, resume swinging from current angle
      isDragging.current = false;
      setIsSwinging(true);
      setManualAngle(0);
    }
  }, []);

  // Reset manual angle when resuming swing
  useEffect(() => {
    if (isSwinging) setManualAngle(0);
  }, [isSwinging]);

  return (
    <section
      className="relative w-full flex items-center justify-center py-10 md:py-14 overflow-hidden select-none"
      aria-label="Interactive OOO logo"
    >
      {/* Pivot point indicator */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-ink/20 dark:bg-white/20 z-10" />

      {/* Hanging wire */}
      <div
        className="absolute top-[22px] left-1/2 w-[1.5px] bg-ink/15 dark:bg-white/15 origin-top z-10"
        style={{
          height: '40px',
          transform: isSwinging
            ? undefined
            : `rotate(${manualAngle * 0.3}deg)`,
          animation: isSwinging
            ? 'pendulum-wire 3.5s cubic-bezier(0.4, 0, 0.6, 1) infinite'
            : 'none',
          transformOrigin: 'top center',
        }}
      />

      {/* The swinging logo */}
      <div
        ref={containerRef}
        className="dangling-logo-container cursor-grab active:cursor-grabbing"
        style={{
          perspective: '800px',
          transformOrigin: 'top center',
          animation: isSwinging
            ? 'pendulum-swing 3.5s cubic-bezier(0.4, 0, 0.6, 1) infinite'
            : 'none',
          transform: isSwinging
            ? undefined
            : `rotate(${manualAngle}deg) rotateY(${manualAngle * 0.8}deg)`,
          transition: isSwinging ? 'none' : 'transform 0.1s ease-out',
          paddingTop: '20px',
        }}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div
          className="relative"
          style={{
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Shadow/glow beneath */}
          <div
            className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-24 h-3 rounded-full bg-ink/10 dark:bg-white/10 blur-md"
            style={{
              animation: isSwinging
                ? 'pendulum-shadow 3.5s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                : 'none',
            }}
          />

          {/* The actual OOO logo — enlarged for impact */}
          <OOOLogo className="h-16 md:h-20 w-auto text-ink dark:text-white drop-shadow-lg" />
        </div>
      </div>

      {/* Subtle instruction text */}
      <p className="absolute bottom-2 text-[9px] font-mono uppercase tracking-widest text-muted/50 transition-opacity duration-500">
        {isSwinging ? 'click to grab' : 'drag to rotate · click to release'}
      </p>
    </section>
  );
}
