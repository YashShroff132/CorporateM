/**
 * CSRF protection via same-origin verification (Req 23.6, 23.9).
 *
 * Browsers attach an `Origin` header to every cross-origin state-changing
 * request (and to same-origin POSTs from `fetch`/forms in modern browsers), and
 * a `Referer` on navigations. Because these headers are set by the browser and
 * cannot be forged by attacker-controlled cross-site script, comparing them to
 * the request's own host is a robust, token-less CSRF defense for a server that
 * only ever accepts state changes from its own origin.
 *
 * We verify that a state-changing request (POST/PUT/PATCH/DELETE) originates
 * from the same origin as the host it is addressed to. When the `Origin` header
 * is present we compare its host to the request host; otherwise we fall back to
 * the `Referer` host. A request whose declared origin/referer host does not
 * match the target host is rejected with 403 (Req 23.9).
 *
 * The Razorpay WEBHOOK route is intentionally exempt from this check: it is a
 * server-to-server call with no browser origin, authenticated instead by an
 * HMAC-SHA256 signature over the raw body (Req 8.5). CSRF (a browser-credential
 * confused-deputy attack) does not apply to it.
 */

/** HTTP methods that mutate state and therefore require CSRF verification. */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Header names a proxy may use to convey the original host. */
const FORWARDED_HOST_HEADERS = ['x-forwarded-host', 'x-forwarded-server'];

export interface CsrfResult {
  readonly ok: boolean;
  /** Present when `ok` is false; a stable machine-readable rejection reason. */
  readonly reason?: 'CROSS_ORIGIN' | 'MISSING_ORIGIN';
}

/** Extract just the host (host:port) from a URL-ish header value. */
function hostOf(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === 'null') return null;
  try {
    return new URL(trimmed).host;
  } catch {
    return null;
  }
}

/** Determine the host the request was addressed to, honoring proxy headers. */
function targetHost(request: Request): string | null {
  for (const name of FORWARDED_HOST_HEADERS) {
    const forwarded = request.headers.get(name);
    if (forwarded !== null && forwarded.trim().length > 0) {
      // A forwarded host may be a comma-separated list; take the first.
      const first = forwarded.split(',')[0]?.trim();
      if (first !== undefined && first.length > 0) return first;
    }
  }
  const host = request.headers.get('host');
  if (host !== null && host.trim().length > 0) return host.trim();
  try {
    return new URL(request.url).host;
  } catch {
    return null;
  }
}

/** True when the request method mutates state and needs CSRF verification. */
export function isStateChangingMethod(method: string): boolean {
  return STATE_CHANGING_METHODS.has(method.toUpperCase());
}

/**
 * Verify that a state-changing request is same-origin (Req 23.6).
 *
 * Returns `{ ok: true }` for safe (non-mutating) methods and for mutating
 * requests whose Origin/Referer host matches the target host. Returns
 * `{ ok: false, reason }` when the origin cannot be established or does not
 * match, so the caller can reject with 403 (Req 23.9).
 */
export function verifySameOrigin(request: Request): CsrfResult {
  if (!isStateChangingMethod(request.method)) {
    return { ok: true };
  }

  const target = targetHost(request);
  if (target === null) {
    // Cannot establish the target host — fail closed.
    return { ok: false, reason: 'MISSING_ORIGIN' };
  }

  const originHost = hostOf(request.headers.get('origin'));
  if (originHost !== null) {
    return originHost === target ? { ok: true } : { ok: false, reason: 'CROSS_ORIGIN' };
  }

  // No Origin header — fall back to Referer (present on form navigations).
  const refererHost = hostOf(request.headers.get('referer'));
  if (refererHost !== null) {
    return refererHost === target ? { ok: true } : { ok: false, reason: 'CROSS_ORIGIN' };
  }

  // Neither Origin nor Referer present on a state-changing request — reject
  // (Req 23.9). Legitimate browser POSTs carry at least one of these.
  return { ok: false, reason: 'MISSING_ORIGIN' };
}
