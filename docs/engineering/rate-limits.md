# Rate limits (slice 041)

The three endpoints anyone can call are the ones worth flooding: the magic-link request sends an
email per call, the verify endpoint takes a token, the invite redeem takes a code. Each is now
capped per subject, in one place.

## Policy (`lib/rate-limit.ts`, `LIMITS`)

| Endpoint | Subject | Limit |
|---|---|---|
| `POST /v1/auth/magic-link` | the email address (hashed) | 5 per 15 minutes |
| `POST /v1/auth/magic-link` | the caller's address | 20 per 15 minutes |
| `POST /v1/auth/magic-link/verify` | the caller's address | 15 per 15 minutes |
| `POST /v1/invites/redeem` | the signed-in account | 10 per hour |
| `POST /v1/invites/redeem` | the caller's address | 30 per hour |

The caller's address is `cf-connecting-ip`, which Cloudflare sets at the edge and nobody else can
spoof past it; it is absent locally and in tests, so address limits never bite a developer and the
per-subject limits are what the tests exercise. A refused call answers `429 RATE_LIMITED` in the
usual error envelope with `Retry-After` in seconds.

## How it counts (`lib/RateLimitDurableObject.ts`)

One Durable Object per `scope:subject` (so a mailbox and an address never share a counter), a
fixed window inside it: the first hit opens the window, hits count until the limit, a refused hit
is not counted (a caller who keeps trying waits for the same window, not a growing one), and the
window reopens `windowSeconds` after it opened. The clock is a parameter so the test walks a
window to its end. The object is registered as `RATE_LIMIT_DO` in every environment (migration
`v2`).

## Facts established by tests (`rate-limit.test.ts`)

The sixth link for one address in a window is 429 with `Retry-After`; the address is
case-insensitive; another address still gets its link; one caller address is capped at twenty
across mailboxes and another caller is not affected; verify attempts from one address are capped
at fifteen and skipped without an address; an account's eleventh invite code in an hour is 429;
the object's window counts, never counts a refusal, and reopens on time.

## Not done

Per-organization limits on writes (announcements, head counts) and on the AI port (ADR-0006:
the AI Gateway carries those); a dashboard of refusals (the logs carry the correlation ids).
