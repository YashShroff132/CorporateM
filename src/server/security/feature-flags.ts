/**
 * Feature-flag gating for routes and server actions (Req 22.2, 22.3, 22.4).
 *
 * Every non-MVP capability is controlled by a boolean flag defaulting to
 * disabled (Req 22.2). Beyond hiding a capability's entry points in the UI
 * (Req 22.3), a *direct* request that targets a disabled capability must be
 * rejected while disclosing no capability content (Req 22.4).
 *
 * `requireFlag` enforces the server side of that rule. When the flag is
 * disabled it triggers Next's `notFound()`, which renders the standard 404 —
 * indistinguishable from a route that does not exist, so no capability content
 * (not even its existence) is disclosed. When the flag is enabled it is a no-op
 * and the caller proceeds.
 *
 * Usage in a route/page or server action guarded by a flag:
 *
 * ```ts
 * import { requireFlag } from '@/server/security/feature-flags';
 *
 * export default async function AiStudioPage() {
 *   requireFlag('aiStudio'); // → notFound() when disabled
 *   // ...render capability
 * }
 * ```
 */

import { notFound } from 'next/navigation';

import { config, type Config_Service, type Flag } from '@/services/config';

/**
 * Return true when `flag` is enabled. Thin wrapper over the Config_Service so
 * callers can branch on a flag without importing the whole service (Req 22.3
 * — omitting entry points from the UI).
 */
export function isFlagEnabled(flag: Flag, service: Config_Service = config): boolean {
  return service.isEnabled(flag);
}

/**
 * Guard a flag-gated route/action: if the capability's flag is disabled, render
 * a 404 that discloses no capability content (Req 22.4). No-op when enabled.
 *
 * `notFound()` throws a control-flow signal that Next intercepts, so this
 * function never returns when the flag is disabled.
 */
export function requireFlag(flag: Flag, service: Config_Service = config): void {
  if (!service.isEnabled(flag)) {
    notFound();
  }
}
