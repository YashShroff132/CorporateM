/**
 * Narrative homepage (Requirement 4).
 *
 * Rendering strategy:
 *  - The narrative acts are server-rendered as static, readable HTML in the
 *    fixed order (Req 4.1) and work fully with JavaScript disabled (Req 4.3).
 *  - The scroll-animation enhancement is a client component whose heavy work
 *    (the scroll/3D module) is code-split via a dynamic `import()` that only
 *    runs in the browser after hydration/FCP (Req 4.5, 4.6). The enhancer gates
 *    its behavior through the pure degradation decision (Req 4.2, 4.7, 4.10).
 *
 * Featured-product shoppable wiring is intentionally out of scope here — that is
 * task 6.2.
 */

import { NarrativeSections } from '@/components/homepage/NarrativeSections';
import { NarrativeEnhancer } from '@/components/homepage/NarrativeEnhancer';

export default function HomePage() {
  return (
    <>
      <NarrativeSections />
      <NarrativeEnhancer />
    </>
  );
}
