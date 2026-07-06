/**
 * Auth_Service — email + phone one-time-password (OTP) authentication.
 *
 * Built to sit on top of Auth.js: the actual session persistence and cookie
 * emission are delegated to an injected {@link SessionEstablisher} (the Auth.js
 * seam), so the OTP domain logic here stays pure and cheaply testable. Every
 * external effect (OTP persistence, code hashing, SMS delivery, user lookup,
 * session establishment, rate limiting, clock, and random code generation) is
 * injected via {@link AuthDeps}.
 *
 * Requirements honored (see requirements.md Req 6):
 * - 6.1  Authentication by email and by phone OTP.
 * - 6.2  Reject OTP requests for anything that is not a valid 10-digit Indian mobile.
 * - 6.3  Issue a 6-digit numeric OTP that expires exactly 5 minutes after issuance
 *        and send it to the supplied phone number.
 * - 6.4  Correct OTP within 5 minutes establishes an authenticated session.
 * - 6.5  Incorrect OTP is rejected, the failed attempt is recorded, remaining
 *        attempts are retained, and an "incorrect" error is returned.
 * - 6.6  After 5 incorrect submissions for a single OTP, that OTP is invalidated
 *        and the user must request a new one.
 * - 6.7  A submission made more than 5 minutes after issuance is rejected as expired.
 * - 6.8  The session is stored in an httpOnly, secure cookie.
 * - 6.9  Each user has a role from {CUSTOMER, ADMIN}, defaulting to CUSTOMER.
 *
 * Per-phone OTP request rate limiting / spacing (Req 6.12/6.13) is wired through
 * the shared rate limiter (src/lib/rate-limit.ts) under the `otpRequest` rule.
 *
 * The raw OTP code is NEVER stored: only a salted hash (`codeHash`) is persisted,
 * matching the `Otp.codeHash` column in the Prisma schema.
 */

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { type Result, ok, err } from '../lib/result';
import type { RateLimiter } from '../lib/rate-limit';

// ---------------------------------------------------------------------------
// Domain constants (traceable to Req 6.3, 6.6)
// ---------------------------------------------------------------------------

/** Number of decimal digits in an issued OTP (Req 6.3). */
export const OTP_LENGTH = 6;

/** OTP time-to-live in milliseconds: expires 5 minutes after issuance (Req 6.3/6.7). */
export const OTP_TTL_MS = 5 * 60 * 1000;

/** Maximum number of incorrect submissions before an OTP is invalidated (Req 6.6). */
export const MAX_OTP_ATTEMPTS = 5;

/** Rate-limit endpoint key used for per-phone OTP request spacing (Req 6.12). */
export const OTP_REQUEST_ENDPOINT = 'otpRequest';

// ---------------------------------------------------------------------------
// Roles (Req 6.9)
// ---------------------------------------------------------------------------

/** User role. Mirrors the Prisma `Role` enum. */
export type Role = 'CUSTOMER' | 'ADMIN';

/** The default role assigned to newly created users (Req 6.9). */
export const DEFAULT_ROLE: Role = 'CUSTOMER';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Discriminated error type describing why an auth operation failed. */
export type AuthError =
  | { readonly kind: 'INVALID_PHONE'; readonly message: string }
  | { readonly kind: 'INVALID_EMAIL'; readonly message: string }
  | {
      readonly kind: 'RATE_LIMITED';
      readonly message: string;
      readonly retryAfterSeconds?: number;
    }
  | { readonly kind: 'SEND_FAILED'; readonly message: string }
  /** No active OTP exists for the phone (never issued, already consumed, or invalidated). */
  | { readonly kind: 'NO_ACTIVE_OTP'; readonly message: string }
  /** The submission arrived more than 5 minutes after issuance (Req 6.7). */
  | { readonly kind: 'OTP_EXPIRED'; readonly message: string }
  /** The OTP was invalidated after 5 incorrect submissions (Req 6.6). */
  | { readonly kind: 'OTP_INVALIDATED'; readonly message: string }
  /** The submitted code was incorrect; `remainingAttempts` are left (Req 6.5). */
  | {
      readonly kind: 'INCORRECT_CODE';
      readonly message: string;
      readonly remainingAttempts: number;
    };

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

/** A persisted OTP record. Mirrors the Prisma `Otp` model (raw code never stored). */
export interface OtpRecord {
  readonly id: string;
  readonly phone: string;
  readonly codeHash: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly attempts: number;
  readonly consumed: boolean;
}

/** Result of a successful OTP issuance (the raw code is intentionally omitted). */
export interface OtpIssued {
  readonly phone: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

/** A user record relevant to authentication. */
export interface AuthUser {
  readonly id: string;
  readonly role: Role;
  readonly phone?: string | null;
  readonly email?: string | null;
}

/**
 * An httpOnly, secure session cookie (Req 6.8). Produced by the Auth.js seam
 * ({@link SessionEstablisher}); `httpOnly` and `secure` are always true.
 */
export interface SessionCookie {
  readonly name: string;
  readonly value: string;
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: 'lax' | 'strict' | 'none';
  readonly path: string;
  /** Cookie lifetime in seconds. */
  readonly maxAge: number;
}

/** An established authenticated session. */
export interface Session {
  readonly userId: string;
  readonly role: Role;
  readonly cookie: SessionCookie;
}

// ---------------------------------------------------------------------------
// Injected dependencies (persistence / integration layer)
// ---------------------------------------------------------------------------

/** Persistence for OTP records (Prisma-backed in production). */
export interface OtpRepository {
  /** Create and persist a new OTP record. */
  create(input: {
    phone: string;
    codeHash: string;
    issuedAt: Date;
    expiresAt: Date;
  }): Promise<OtpRecord>;
  /**
   * Return the most recently issued OTP for `phone` that has not been consumed,
   * or `null` when none exists. Expired-but-unconsumed records ARE returned so
   * the service can distinguish "expired" (Req 6.7) from "no active OTP".
   */
  findLatestUnconsumed(phone: string): Promise<OtpRecord | null>;
  /** Set `attempts` to the given value for the record and return the updated record. */
  setAttempts(id: string, attempts: number): Promise<OtpRecord>;
  /** Mark the record consumed (invalidated), so it can no longer be used. */
  markConsumed(id: string): Promise<void>;
}

/** User lookup/creation. New users default to role CUSTOMER (Req 6.9). */
export interface UserRepository {
  findByPhone(phone: string): Promise<AuthUser | null>;
  createWithPhone(phone: string, role: Role): Promise<AuthUser>;
  findByEmail(email: string): Promise<AuthUser | null>;
  createWithEmail(email: string, role: Role): Promise<AuthUser>;
}

/**
 * The Auth.js seam: establishes a session for an authenticated user and returns
 * the httpOnly secure cookie to set on the response (Req 6.8).
 */
export interface SessionEstablisher {
  establish(user: AuthUser): Promise<Session>;
}

/** Delivers the OTP code to the phone number (SMS provider). */
export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

/** Hashes an OTP code for storage. MUST be deterministic for a given (phone, code). */
export interface OtpHasher {
  hash(phone: string, code: string): string;
}

/** Generates a fresh OTP code of {@link OTP_LENGTH} numeric digits. */
export type OtpCodeGenerator = () => string;

/** All dependencies required to construct an {@link Auth_Service}. */
export interface AuthDeps {
  readonly otps: OtpRepository;
  readonly users: UserRepository;
  readonly sessions: SessionEstablisher;
  readonly sender: OtpSender;
  readonly rateLimiter: RateLimiter;
  /** Optional custom hasher; defaults to an HMAC-SHA256 hasher (see {@link createDefaultOtpHasher}). */
  readonly hasher?: OtpHasher;
  /** Optional custom code generator; defaults to a CSPRNG 6-digit generator. */
  readonly codeGenerator?: OtpCodeGenerator;
}

// ---------------------------------------------------------------------------
// Pure helpers (validation, generation, timing)
// ---------------------------------------------------------------------------

const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;
// Deliberately conservative email check; the authoritative validation happens in
// the Auth.js email flow. Rejects empty/space and obviously malformed addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalize a phone string to its bare 10-digit national form, stripping common
 * India dialing prefixes (`+91`, `91`, leading `0`) and separators. Returns the
 * 10-digit number when it is a valid Indian mobile (first digit 6-9), otherwise
 * `null` (Req 6.2).
 */
export function normalizeIndianMobile(input: string): string | null {
  if (typeof input !== 'string') return null;
  // Remove spaces, hyphens, parentheses, and dots.
  let digits = input.replace(/[\s\-().]/g, '');
  // Strip a leading '+'.
  if (digits.startsWith('+')) digits = digits.slice(1);
  // Strip country code / trunk prefix when it yields a 10-digit remainder.
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return INDIAN_MOBILE_RE.test(digits) ? digits : null;
}

/** True when `input` is a valid 10-digit Indian mobile number (Req 6.2). */
export function isValidIndianMobile(input: string): boolean {
  return normalizeIndianMobile(input) !== null;
}

/** True when `input` is a syntactically valid email address (Req 6.1). */
export function isValidEmail(input: string): boolean {
  return typeof input === 'string' && EMAIL_RE.test(input.trim());
}

/** True when `code` is exactly {@link OTP_LENGTH} decimal digits (Req 6.3). */
export function isValidOtpFormat(code: string): boolean {
  return typeof code === 'string' && new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
}

/** Compute the expiry instant for an OTP issued at `issuedAt` (Req 6.3). */
export function computeExpiry(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + OTP_TTL_MS);
}

/**
 * Default CSPRNG-backed 6-digit OTP generator. Uses `crypto.randomInt` for a
 * uniform distribution over 000000..999999 and zero-pads (Req 6.3).
 */
export const generateOtpCode: OtpCodeGenerator = () => {
  const n = randomInt(0, 10 ** OTP_LENGTH); // [0, 1_000_000)
  return n.toString().padStart(OTP_LENGTH, '0');
};

/**
 * Create the default OTP hasher: HMAC-SHA256 over `${phone}:${code}` keyed by a
 * server-side secret (pepper). The raw code is never persisted (Req: schema
 * `codeHash`). The secret defaults to the `OTP_HASH_SECRET` env var.
 */
export function createDefaultOtpHasher(secret?: string): OtpHasher {
  const key = secret ?? process.env.OTP_HASH_SECRET ?? '';
  return {
    hash(phone, code): string {
      return createHmac('sha256', key).update(`${phone}:${code}`).digest('hex');
    },
  };
}

/** Constant-time comparison of two hex digest strings. */
function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** The Auth_Service interface (design.md § Auth_Service). */
export interface Auth_Service {
  /**
   * Issue an OTP for a valid Indian mobile number. Enforces per-phone request
   * rate limiting/spacing, generates a 6-digit code with 5-minute expiry, stores
   * only its hash, and sends the code to the phone (Req 6.2, 6.3, 6.12/6.13).
   */
  requestOtp(phone: string, now?: Date): Promise<Result<OtpIssued, AuthError>>;
  /**
   * Verify a submitted OTP. On the correct code within 5 minutes, establishes a
   * session (creating the user with the default role if needed). Handles wrong
   * codes, attempt exhaustion, and expiry per Req 6.4-6.7.
   */
  verifyOtp(phone: string, code: string, now?: Date): Promise<Result<Session, AuthError>>;
  /**
   * Establish a session from a verified email address (the post-verification step
   * of the Auth.js email flow). Creates the user with the default role if needed
   * (Req 6.1, 6.9).
   */
  signInWithEmail(email: string, now?: Date): Promise<Result<Session, AuthError>>;
}

/** Construct an {@link Auth_Service} from its dependencies. */
export function createAuthService(deps: AuthDeps): Auth_Service {
  const hasher = deps.hasher ?? createDefaultOtpHasher();
  const codeGenerator = deps.codeGenerator ?? generateOtpCode;

  async function requestOtp(
    phone: string,
    now: Date = new Date(),
  ): Promise<Result<OtpIssued, AuthError>> {
    // Req 6.2: reject anything that is not a valid 10-digit Indian mobile.
    const normalized = normalizeIndianMobile(phone);
    if (normalized === null) {
      return err({
        kind: 'INVALID_PHONE',
        message: 'Enter a valid 10-digit Indian mobile number.',
      });
    }

    // Req 6.12/6.13: per-phone request spacing and rolling-window cap.
    const decision = deps.rateLimiter.check(
      OTP_REQUEST_ENDPOINT,
      normalized,
      now.getTime(),
    );
    if (!decision.allowed) {
      return err({
        kind: 'RATE_LIMITED',
        message: 'Too many OTP requests. Please wait before trying again.',
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }

    // Req 6.3: 6-digit numeric code, 5-minute expiry; store only the hash.
    const code = codeGenerator();
    const issuedAt = new Date(now.getTime());
    const expiresAt = computeExpiry(issuedAt);
    const codeHash = hasher.hash(normalized, code);

    await deps.otps.create({ phone: normalized, codeHash, issuedAt, expiresAt });

    // Req 6.3: send the code to the supplied phone number.
    try {
      await deps.sender.send(normalized, code);
    } catch {
      return err({
        kind: 'SEND_FAILED',
        message: 'Could not send the OTP. Please try again.',
      });
    }

    return ok({ phone: normalized, issuedAt, expiresAt });
  }

  async function verifyOtp(
    phone: string,
    code: string,
    now: Date = new Date(),
  ): Promise<Result<Session, AuthError>> {
    const normalized = normalizeIndianMobile(phone);
    if (normalized === null) {
      return err({
        kind: 'INVALID_PHONE',
        message: 'Enter a valid 10-digit Indian mobile number.',
      });
    }

    const record = await deps.otps.findLatestUnconsumed(normalized);
    if (record === null) {
      // Never issued, already used, or invalidated -> user must request a new one.
      return err({
        kind: 'NO_ACTIVE_OTP',
        message: 'No active OTP. Please request a new code.',
      });
    }

    // Req 6.6: an OTP that already reached the attempt limit is invalid.
    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      await deps.otps.markConsumed(record.id);
      return err({
        kind: 'OTP_INVALIDATED',
        message: 'This code is no longer valid. Please request a new one.',
      });
    }

    // Req 6.7: reject submissions made after the 5-minute expiry.
    if (now.getTime() > record.expiresAt.getTime()) {
      return err({
        kind: 'OTP_EXPIRED',
        message: 'This code has expired. Please request a new one.',
      });
    }

    // Compare against the stored hash in constant time.
    const submittedHash = hasher.hash(normalized, code);
    const matches = isValidOtpFormat(code) && hashesEqual(submittedHash, record.codeHash);

    if (!matches) {
      // Req 6.5: record the failed attempt and retain remaining attempts.
      const attempts = record.attempts + 1;
      await deps.otps.setAttempts(record.id, attempts);

      // Req 6.6: invalidate after the 5th incorrect submission.
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await deps.otps.markConsumed(record.id);
        return err({
          kind: 'OTP_INVALIDATED',
          message: 'Too many incorrect attempts. Please request a new code.',
        });
      }

      return err({
        kind: 'INCORRECT_CODE',
        message: 'The code you entered is incorrect.',
        remainingAttempts: MAX_OTP_ATTEMPTS - attempts,
      });
    }

    // Correct code within the window (Req 6.4): consume it and establish a session.
    await deps.otps.markConsumed(record.id);

    let user = await deps.users.findByPhone(normalized);
    if (user === null) {
      // Req 6.9: new users default to CUSTOMER.
      user = await deps.users.createWithPhone(normalized, DEFAULT_ROLE);
    }

    const session = await deps.sessions.establish(user);
    return ok(session);
  }

  async function signInWithEmail(
    email: string,
    _now: Date = new Date(),
  ): Promise<Result<Session, AuthError>> {
    void _now;
    if (!isValidEmail(email)) {
      return err({ kind: 'INVALID_EMAIL', message: 'Enter a valid email address.' });
    }
    const normalized = email.trim().toLowerCase();

    let user = await deps.users.findByEmail(normalized);
    if (user === null) {
      // Req 6.9: new users default to CUSTOMER.
      user = await deps.users.createWithEmail(normalized, DEFAULT_ROLE);
    }

    const session = await deps.sessions.establish(user);
    return ok(session);
  }

  return { requestOtp, verifyOtp, signInWithEmail };
}
