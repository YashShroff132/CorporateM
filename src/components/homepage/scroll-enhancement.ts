/**
 * Code-split scroll enhancement module (Req 4.6).
 *
 * This module is loaded lazily via dynamic `import()` AFTER first contentful
 * paint, so its cost never counts against the hero's pre-hydration JS budget
 * (Req 4.5). In a full build this is where GSAP timelines (and, when enabled,
 * a Three.js scene) would be wired up; here we ship a dependency-free,
 * IntersectionObserver-based reveal so the enhancement stays lightweight while
 * the important, testable logic lives in the pure degradation core.
 *
 * The module exposes an idempotent `enable`/`disable` pair. `enable` is only
 * ever called when the pure decision permits animations.
 */

let observer: IntersectionObserver | null = null;

/** Attach scroll-reveal enhancement to the narrative acts. Idempotent. */
export function enable(): void {
  if (typeof document === 'undefined') return;
  if (observer !== null) return;

  const acts = Array.from(document.querySelectorAll<HTMLElement>('.narrative-act'));
  if (acts.length === 0) return;

  if (typeof IntersectionObserver !== 'function') {
    // No observer support: reveal everything immediately (still enhanced-safe).
    acts.forEach((act) => act.classList.add('is-visible'));
    return;
  }

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer?.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15 },
  );

  for (const act of acts) {
    act.classList.add('enhanced');
    observer.observe(act);
  }
}

/** Detach the enhancement and restore the static presentation. Idempotent. */
export function disable(): void {
  if (typeof document === 'undefined') return;
  observer?.disconnect();
  observer = null;
  document
    .querySelectorAll<HTMLElement>('.narrative-act')
    .forEach((act) => act.classList.remove('enhanced', 'is-visible'));
}
