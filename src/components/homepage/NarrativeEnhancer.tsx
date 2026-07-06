'use client';

/**
 * NarrativeEnhancer — the progressive-enhancement controller (Req 4.6, 4.10).
 *
 * It renders NOTHING itself; the readable narrative is already server-rendered
 * by {@link NarrativeSections}. This client component runs after hydration and:
 *
 *   1. Waits for first contentful paint, then code-splits the scroll
 *      enhancement (and, when enabled, would code-split Three.js) via dynamic
 *      `import()` so none of it is in the hero's pre-hydration bundle (Req 4.5).
 *   2. Races that import against a 5-second timeout (Req 4.10).
 *   3. Feeds the real browser environment + load outcome into the PURE
 *      {@link decideDegradation} core (Req 4.2, 4.7) and only enables animations
 *      when the decision permits it. Otherwise the static sections remain.
 */

import { useEffect } from 'react';
import {
  LIBRARY_LOAD_TIMEOUT_MS,
  decideDegradation,
} from '@/lib/homepage-degradation';
import { readBrowserEnvironment } from '@/lib/homepage-environment';

/** Resolve `true` if the promise settles before the timeout, else `false`. */
function withinTimeout<T>(promise: Promise<T>, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, ms);
    promise.then(
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(true);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(false);
        }
      },
    );
  });
}

/** Schedule work to run after the browser has painted at least once. */
function afterFirstPaint(run: () => void): void {
  if (typeof window === 'undefined') return;
  if (typeof requestAnimationFrame === 'function') {
    // Two RAFs ensures we are past the first paint before we start loading.
    requestAnimationFrame(() => requestAnimationFrame(run));
  } else {
    setTimeout(run, 0);
  }
}

export function NarrativeEnhancer() {
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    afterFirstPaint(() => {
      if (cancelled) return;

      // Code-split: the enhancement module is only fetched here, after FCP.
      const loadPromise = import('./scroll-enhancement');

      void withinTimeout(loadPromise, LIBRARY_LOAD_TIMEOUT_MS).then(
        (loadedInTime) => {
          if (cancelled) return;

          const env = readBrowserEnvironment(loadedInTime);
          const decision = decideDegradation(env);

          if (!decision.animationsEnabled) {
            // Static sections stay in place (Req 4.2, 4.10). Nothing to do.
            return;
          }

          // Libraries loaded in time and animations are permitted.
          void loadPromise.then((mod) => {
            if (cancelled) return;
            mod.enable();
            cleanup = () => mod.disable();
            // NOTE: threeDSceneEnabled would gate a Three.js scene here
            // (Req 4.7); disabled devices fall back to the static hero image.
          });
        },
      );
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
