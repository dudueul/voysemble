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
| `POST /v1/orgs/{orgId}/invitations` (slice 042) | the organization | 20 per hour |

The organizer invitation (slice 042) is an authenticated owner action, but each one sends an email
on the organization's behalf, so it is capped per organization (the fifth test in
`organizer-invitations.test.ts`).

The caller's address is `cf-connecting-ip`, which Cloudflare sets at the edge and nobody else can
spoof past it. It is absent in the worker tests (which set it by hand when they test an address
limit), and `wrangler dev` reports the loopback address (`127.0.0.1`, `::1`) for every request, so
a loopback caller gets no address limit: the browser suite signs in dozens of times from one
machine, and CI run 38252080198 (slice 041) tripped the twenty-link limit halfway through it
before this rule existed. Cloudflare's edge never reports a loopback address, so production is
unaffected. A refused call answers `429 RATE_LIMITED` in the usual error envelope with
`Retry-After` in seconds.

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
at fifteen and skipped without an address or from a loopback address; an account's eleventh invite code in an hour is 429;
the object's window counts, never counts a refusal, and reopens on time.

## Not done

Per-organization limits on writes (announcements, head counts) and on the AI port (ADR-0006:
the AI Gateway carries those); a dashboard of refusals (the logs carry the correlation ids).
