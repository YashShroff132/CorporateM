'use client';

/**
 * TrackOnMount — fire a single analytics funnel event once after mount
 * (Req 19.5). Used to emit page-level events (product view, begin checkout,
 * payment success) from server-rendered pages by dropping this tiny client
 * component into the tree.
 *
 * Emission goes through `trackEvent`, which is fully non-blocking and no-ops
 * when no provider is configured (Req 19.8), so this renders nothing and never
 * affects the page.
 */

import { useEffect } from 'react';

import { trackEvent, type AnalyticsProps } from '@/lib/analytics';

export function TrackOnMount({
  event,
  props,
}: {
  event: string;
  props?: AnalyticsProps;
}) {
  useEffect(() => {
    trackEvent(event, props ?? {});
    // Fire exactly once per mount for this event/props pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
