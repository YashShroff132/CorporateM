/**
 * Admin authentication — pragmatic single-password gate for launch.
 *
 * SECURITY NOTE: This is a deliberately minimal gate so the store owner can
 * manage the catalog on launch day. It authenticates a single shared password
 * (env `ADMIN_PASSWORD`) and issues an HMAC-signed session cookie (signed with
 * env `ADMIN_SESSION_SECRET`). It is intended to be replaced by role-based OTP
 * authentication (Req 11.1 / 6.9) post-launch. Neither the password nor the
 * secret is ever sent to the client — only the opaque signed token is.
 *
 * The cookie is httpOnly + secure + sameSite=strict and carries an issued-at
 * timestamp so sessions expire server-side after {@link SESSION_MAX_AGE_SECONDS}.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/** Cookie name holding the signed admin session token. */
export const ADMIN_SESSION_COOKIE = 'adminSession';

/** Session lifetime — 12 hours is plenty for a working session. */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

/** The fixed subject encoded into every admin session token. */
const SESSION_SUBJECT = 'admin';

/** Actor id written to every admin AuditLog row. */
export const ADMIN_ACTOR_ID = 'admin';

/**
 * Whether the admin gate is configured. When `ADMIN_PASSWORD` is unset the
 * login page shows a clear "set ADMIN_PASSWORD env" message instead of a form.
 */
export function isAdminConfigured(): boolean {
  return (process.env.ADMIN_PASSWORD ?? '').length > 0;
}

/** Read the signing secret, falling back to the password when unset. */
function sessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET ?? '';
  if (secret.length > 0) return secret;
  // Fall back to the password so a misconfigured secret still yields a stable,
  // non-empty signing key rather than signing with an empty string.
  return process.env.ADMIN_PASSWORD ?? 'insecure-development-secret';
}

/** Base64url encode a UTF-8 string. */
function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

/** Compute the HMAC-SHA256 signature (base64url) of a payload string. */
function sign(payload: string): string {
  return createHmac('sha256', sessionSecret())
    .update(payload)
    .digest('base64url');
}

/**
 * Constant-time comparison of two signatures to avoid timing side channels.
 */
function signaturesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify a submitted password against `ADMIN_PASSWORD` in constant time.
 * Returns false when the password is unset or does not match.
 */
export function verifyPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? '';
  if (expected.length === 0) return false;
  const bufA = Buffer.from(candidate);
  const bufB = Buffer.from(expected);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Build a signed session token of the form `payload.signature`, where payload
 * is `base64url("admin:<issuedAtMs>")`.
 */
function createToken(): string {
  const payload = b64url(`${SESSION_SUBJECT}:${Date.now()}`);
  return `${payload}.${sign(payload)}`;
}

/**
 * Validate a session token: signature must match and the issued-at timestamp
 * must be within the max age window.
 */
function isTokenValid(token: string | undefined): boolean {
  if (token === undefined || token.length === 0) return false;
  const dotIndex = token.indexOf('.');
  if (dotIndex <= 0) return false;
  const payload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);
  if (!signaturesMatch(sign(payload), signature)) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  const [subject, issuedAtRaw] = decoded.split(':');
  if (subject !== SESSION_SUBJECT) return false;
  const issuedAt = Number.parseInt(issuedAtRaw ?? '', 10);
  if (!Number.isFinite(issuedAt)) return false;
  const ageSeconds = (Date.now() - issuedAt) / 1000;
  return ageSeconds >= 0 && ageSeconds <= SESSION_MAX_AGE_SECONDS;
}

/** Options applied when writing the admin session cookie. */
function cookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Establish an admin session by writing a fresh signed cookie. Call only from
 * a Server Action or Route Handler (it writes a cookie).
 */
export async function establishAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, createToken(), cookieOptions());
}

/** Clear the admin session cookie (logout). */
export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
}

/** Whether the current request carries a valid admin session cookie. */
export async function hasAdminSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  return isTokenValid(token);
}

/**
 * Guard for admin pages/actions: if the current request lacks a valid session,
 * redirect to the login page. Returns normally when the session is valid.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await hasAdminSession())) {
    redirect('/admin/login');
  }
}
