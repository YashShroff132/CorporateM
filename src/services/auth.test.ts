import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAuthService,
  createDefaultOtpHasher,
  generateOtpCode,
  isValidEmail,
  isValidIndianMobile,
  isValidOtpFormat,
  normalizeIndianMobile,
  computeExpiry,
  DEFAULT_ROLE,
  MAX_OTP_ATTEMPTS,
  OTP_LENGTH,
  OTP_TTL_MS,
  OTP_REQUEST_ENDPOINT,
  type AuthUser,
  type OtpRecord,
  type OtpRepository,
  type SessionEstablisher,
  type UserRepository,
} from './auth';
import { createRateLimiter, type RateLimiter } from '../lib/rate-limit';

// ---------------------------------------------------------------------------
// In-memory test doubles (no mocking of the logic under test)
// ---------------------------------------------------------------------------

function makeOtpRepo(): OtpRepository & { records: OtpRecord[] } {
  const records: OtpRecord[] = [];
  let seq = 0;
  return {
    records,
    async create(input) {
      const rec: OtpRecord = {
        id: `otp_${seq++}`,
        phone: input.phone,
        codeHash: input.codeHash,
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
        attempts: 0,
        consumed: false,
      };
      records.push(rec);
      return rec;
    },
    async findLatestUnconsumed(phone) {
      const matches = records.filter((r) => r.phone === phone && !r.consumed);
      if (matches.length === 0) return null;
      return matches.reduce((a, b) => (b.issuedAt >= a.issuedAt ? b : a));
    },
    async setAttempts(id, attempts) {
      const idx = records.findIndex((r) => r.id === id);
      const updated = { ...records[idx]!, attempts };
      records[idx] = updated;
      return updated;
    },
    async markConsumed(id) {
      const idx = records.findIndex((r) => r.id === id);
      if (idx >= 0) records[idx] = { ...records[idx]!, consumed: true };
    },
  };
}

function makeUserRepo(): UserRepository & { users: AuthUser[] } {
  const users: AuthUser[] = [];
  let seq = 0;
  return {
    users,
    async findByPhone(phone) {
      return users.find((u) => u.phone === phone) ?? null;
    },
    async createWithPhone(phone, role) {
      const u: AuthUser = { id: `user_${seq++}`, role, phone };
      users.push(u);
      return u;
    },
    async findByEmail(email) {
      return users.find((u) => u.email === email) ?? null;
    },
    async createWithEmail(email, role) {
      const u: AuthUser = { id: `user_${seq++}`, role, email };
      users.push(u);
      return u;
    },
  };
}

function makeSessionEstablisher(): SessionEstablisher {
  return {
    async establish(user) {
      return {
        userId: user.id,
        role: user.role,
        cookie: {
          name: 'session',
          value: `token-${user.id}`,
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 30,
        },
      };
    },
  };
}

function makeDeps(now: () => number) {
  const otps = makeOtpRepo();
  const users = makeUserRepo();
  const sessions = makeSessionEstablisher();
  // Capture the code that was sent so verify tests can use the real code.
  const capturingSender = {
    send: vi.fn<(phone: string, code: string) => Promise<void>>(async () => {}),
  };
  const rateLimiter: RateLimiter = createRateLimiter({
    limits: { [OTP_REQUEST_ENDPOINT]: { max: 3, windowSeconds: 600, minIntervalSeconds: 30 } },
    now,
  });
  const service = createAuthService({
    otps,
    users,
    sessions,
    sender: capturingSender,
    rateLimiter,
  });
  return { service, otps, users, capturingSender, rateLimiter };
}

const VALID_PHONE = '9876543210';

describe('phone validation (Req 6.2)', () => {
  it('accepts valid 10-digit Indian mobiles starting 6-9', () => {
    for (const p of ['6000000000', '7123456789', '8987654321', '9876543210']) {
      expect(isValidIndianMobile(p)).toBe(true);
    }
  });

  it('rejects invalid numbers', () => {
    for (const p of ['1234567890', '5876543210', '987654321', '98765432101', '', 'abcdefghij']) {
      expect(isValidIndianMobile(p)).toBe(false);
    }
  });

  it('normalizes common dialing prefixes to the bare 10 digits', () => {
    expect(normalizeIndianMobile('+91 98765 43210')).toBe('9876543210');
    expect(normalizeIndianMobile('919876543210')).toBe('9876543210');
    expect(normalizeIndianMobile('09876543210')).toBe('9876543210');
    expect(normalizeIndianMobile('98765-43210')).toBe('9876543210');
  });
});

describe('OTP generation and format (Req 6.3)', () => {
  it('generates a 6-digit numeric code', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtpCode();
      expect(code).toHaveLength(OTP_LENGTH);
      expect(isValidOtpFormat(code)).toBe(true);
    }
  });

  it('computes expiry exactly 5 minutes after issuance', () => {
    const issued = new Date('2026-01-01T00:00:00.000Z');
    expect(computeExpiry(issued).getTime() - issued.getTime()).toBe(OTP_TTL_MS);
  });
});

describe('email validation (Req 6.1)', () => {
  it('accepts well-formed addresses and rejects malformed ones', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('a.b+c@sub.domain.co')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('requestOtp', () => {
  let clock = 0;
  const now = () => clock;
  beforeEach(() => {
    clock = Date.parse('2026-01-01T00:00:00.000Z');
  });

  it('rejects an invalid phone number (Req 6.2)', async () => {
    const { service } = makeDeps(now);
    const res = await service.requestOtp('12345', new Date(clock));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('INVALID_PHONE');
  });

  it('issues an OTP, persists only a hash, and sends the code (Req 6.3)', async () => {
    const { service, otps, capturingSender } = makeDeps(now);
    const res = await service.requestOtp(VALID_PHONE, new Date(clock));
    expect(res.ok).toBe(true);
    expect(otps.records).toHaveLength(1);
    const rec = otps.records[0]!;
    // The raw code is never stored.
    const sentCode = capturingSender.send.mock.calls[0]![1];
    expect(rec.codeHash).not.toContain(sentCode);
    expect(rec.expiresAt.getTime() - rec.issuedAt.getTime()).toBe(OTP_TTL_MS);
    expect(capturingSender.send).toHaveBeenCalledWith(VALID_PHONE, sentCode);
  });

  it('enforces the 30-second minimum spacing and 3-per-window cap (Req 6.12/6.13)', async () => {
    const { service } = makeDeps(now);
    const first = await service.requestOtp(VALID_PHONE, new Date(clock));
    expect(first.ok).toBe(true);

    // Immediate retry -> blocked by min interval.
    const tooSoon = await service.requestOtp(VALID_PHONE, new Date(clock + 1000));
    expect(tooSoon.ok).toBe(false);
    if (!tooSoon.ok) expect(tooSoon.error.kind).toBe('RATE_LIMITED');

    // After 30s + 30s more -> two more allowed, then the 4th within window blocked.
    const second = await service.requestOtp(VALID_PHONE, new Date(clock + 30_000));
    expect(second.ok).toBe(true);
    const third = await service.requestOtp(VALID_PHONE, new Date(clock + 60_000));
    expect(third.ok).toBe(true);
    const fourth = await service.requestOtp(VALID_PHONE, new Date(clock + 90_000));
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.error.kind).toBe('RATE_LIMITED');
  });
});

describe('verifyOtp lifecycle (Req 6.4-6.7, 6.8, 6.9)', () => {
  let clock = 0;
  const now = () => clock;
  const issuedAt = () => new Date(clock);

  beforeEach(() => {
    clock = Date.parse('2026-01-01T00:00:00.000Z');
  });

  async function issueAndGetCode(deps: ReturnType<typeof makeDeps>): Promise<string> {
    await deps.service.requestOtp(VALID_PHONE, issuedAt());
    return deps.capturingSender.send.mock.calls.at(-1)![1];
  }

  it('correct code within 5 minutes establishes a session with a secure httpOnly cookie', async () => {
    const deps = makeDeps(now);
    const code = await issueAndGetCode(deps);
    const res = await deps.service.verifyOtp(VALID_PHONE, code, new Date(clock + 60_000));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.role).toBe(DEFAULT_ROLE);
      expect(res.value.cookie.httpOnly).toBe(true);
      expect(res.value.cookie.secure).toBe(true);
    }
    // A new user was created with the default role.
    expect(deps.users.users).toHaveLength(1);
    expect(deps.users.users[0]!.role).toBe('CUSTOMER');
  });

  it('reuses an existing user rather than creating a duplicate', async () => {
    const deps = makeDeps(now);
    deps.users.users.push({ id: 'existing', role: 'ADMIN', phone: VALID_PHONE });
    const code = await issueAndGetCode(deps);
    const res = await deps.service.verifyOtp(VALID_PHONE, code, new Date(clock + 1000));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.userId).toBe('existing');
    expect(deps.users.users).toHaveLength(1);
  });

  it('incorrect code is rejected, records the attempt, retains remaining attempts (Req 6.5)', async () => {
    const deps = makeDeps(now);
    await issueAndGetCode(deps);
    const res = await deps.service.verifyOtp(VALID_PHONE, '000000', new Date(clock + 1000));
    expect(res.ok).toBe(false);
    if (!res.ok && res.error.kind === 'INCORRECT_CODE') {
      expect(res.error.remainingAttempts).toBe(MAX_OTP_ATTEMPTS - 1);
    } else {
      throw new Error('expected INCORRECT_CODE');
    }
    expect(deps.otps.records[0]!.attempts).toBe(1);
  });

  it('invalidates the OTP after 5 incorrect submissions (Req 6.6)', async () => {
    const deps = makeDeps(now);
    const code = await issueAndGetCode(deps);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 1; i <= MAX_OTP_ATTEMPTS - 1; i++) {
      const r = await deps.service.verifyOtp(VALID_PHONE, wrong, new Date(clock + 1000));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe('INCORRECT_CODE');
    }
    // 5th wrong submission -> invalidated.
    const fifth = await deps.service.verifyOtp(VALID_PHONE, wrong, new Date(clock + 1000));
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) expect(fifth.error.kind).toBe('OTP_INVALIDATED');

    // Even the correct code no longer works.
    const afterLock = await deps.service.verifyOtp(VALID_PHONE, code, new Date(clock + 2000));
    expect(afterLock.ok).toBe(false);
    if (!afterLock.ok) expect(afterLock.error.kind).toBe('NO_ACTIVE_OTP');
  });

  it('rejects a correct code submitted after 5 minutes as expired (Req 6.7)', async () => {
    const deps = makeDeps(now);
    const code = await issueAndGetCode(deps);
    const res = await deps.service.verifyOtp(
      VALID_PHONE,
      code,
      new Date(clock + OTP_TTL_MS + 1),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('OTP_EXPIRED');
  });

  it('returns NO_ACTIVE_OTP when none was issued', async () => {
    const deps = makeDeps(now);
    const res = await deps.service.verifyOtp(VALID_PHONE, '123456', new Date(clock));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('NO_ACTIVE_OTP');
  });
});

describe('signInWithEmail (Req 6.1, 6.9)', () => {
  const now = () => Date.parse('2026-01-01T00:00:00.000Z');

  it('rejects an invalid email', async () => {
    const { service } = makeDeps(now);
    const res = await service.signInWithEmail('not-an-email');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('INVALID_EMAIL');
  });

  it('creates a CUSTOMER user and establishes a secure session', async () => {
    const { service, users } = makeDeps(now);
    const res = await service.signInWithEmail('User@Example.com');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.role).toBe('CUSTOMER');
      expect(res.value.cookie.httpOnly).toBe(true);
      expect(res.value.cookie.secure).toBe(true);
    }
    // Email normalized to lowercase.
    expect(users.users[0]!.email).toBe('user@example.com');
  });
});

describe('default hasher', () => {
  it('is deterministic and does not reveal the raw code', () => {
    const hasher = createDefaultOtpHasher('test-secret');
    const h1 = hasher.hash(VALID_PHONE, '123456');
    const h2 = hasher.hash(VALID_PHONE, '123456');
    expect(h1).toBe(h2);
    expect(h1).not.toContain('123456');
    expect(hasher.hash(VALID_PHONE, '654321')).not.toBe(h1);
  });
});
