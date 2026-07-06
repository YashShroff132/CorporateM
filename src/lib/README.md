# Lib

Shared libraries and pure logic cores used across services.

Planned modules (per design.md):

- `money` — integer paise arithmetic (branded `Paise` type, half-up rounding)
- `db` — Prisma client singleton
- `result` — `Result<T, E>` helper type used by pure logic cores
- `rate-limit` — per-identifier rolling-window rate limiter with minimum inter-request interval (OTP, auth, admin, AI generation)
