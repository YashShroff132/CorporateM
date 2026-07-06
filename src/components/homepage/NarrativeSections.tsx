/**
 * NarrativeSections — the server-rendered, static narrative (Requirement 4).
 *
 * This is a plain Server Component: it emits fully readable HTML for every
 * narrative act in the fixed order (Req 4.1) with NO client JavaScript required
 * (Req 4.3). It is the baseline experience — the scroll animation and 3D scene
 * are progressive enhancements layered on top after FCP (Req 4.6) and gated by
 * the pure degradation decision (Req 4.2, 4.7, 4.10).
 *
 * Because this markup is the fallback for no-JS, reduced-motion, low-end
 * devices, and library-load-timeout, it must remain self-sufficient and legible
 * on its own.
 */

import { NARRATIVE_ACTS } from './narrative-content';

export function NarrativeSections() {
  return (
    <main id="narrative" className="flex flex-col">
      {NARRATIVE_ACTS.map((act, index) => (
        <section
          key={act.id}
          id={act.id}
          data-act={act.id}
          data-act-index={index}
          className="narrative-act mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-20"
        >
          <p className="text-sm font-semibold uppercase tracking-widest text-stamp-red">
            {act.kicker}
          </p>
          <h2 className="text-3xl font-black tracking-tight md:text-5xl">{act.title}</h2>
          {act.body.map((paragraph, i) => (
            <p key={i} className="text-lg leading-relaxed text-muted">
              {paragraph}
            </p>
          ))}
          {act.cta && (
            <a
              href={act.cta.href}
              className="mt-2 inline-flex w-fit items-center rounded-full bg-ink px-6 py-3 text-base font-semibold text-paper transition-colors hover:bg-corporate"
            >
              {act.cta.label}
            </a>
          )}
        </section>
      ))}
    </main>
  );
}
