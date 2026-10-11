# Identity, organizations, trips, roster, invites (slice 006)

Implements D12, D21, D26 and ADR-0007 "Sessions"/"Invitations" on the API Worker. Everything
below is exercised by `apps/api-worker/test/{auth,organizations,roster-invites,csv,schema}.test.ts`.

## Storage

| Store | Tables | Notes |
|---|---|---|
| Global D1 (`DB`) | `accounts`, `sessions`, `magic_links`, `organizations`, `memberships`, `invite_codes` | SQL in `apps/api-worker/migrations/0001_identity.sql`. Drizzle schema in `src/db/schema.ts`; `test/schema.test.ts` fails if they drift. |
| OrgDurableObject (`ORG_DO`, one per organization, name = organization id) | `schema_version`, `trips`, `participations` | In-object versioned migrations (`MIGRATIONS` array in `src/org/OrgDurableObject.ts`), applied under `blockConcurrencyWhile` on wake. |
| KV `DEV_MAILBOX` | fixture mailbox | Local and tests only. Named environments do not bind it, so `createEmailPort` returns `UnavailableEmailPort` there until the Email Service binding is provisioned. |

Secrets are never stored. `sessions.token_hash`, `magic_links.token_hash`, `invite_codes.code_hash`
hold SHA-256 of the presented value. Lookups compare hashes, so timing does not depend on the secret.

## Flows

### Magic-link sign-in

1. `POST /v1/auth/magic-link {email, locale}` always answers 202 with the same body. A row in
   `magic_links` (15 min TTL) and one email through `EmailPort`. The link is
   `<origin>/auth/verify#token=...`: fragment, so the token never reaches logs or Referer.
2. `POST /v1/auth/magic-link/verify {token, client}` consumes the row atomically
   (`UPDATE ... WHERE consumed_at IS NULL`), creates the account on first use, mints a session.
   - `client: web`: `Set-Cookie: vy_session=...; HttpOnly; Secure; SameSite=Lax; Path=/`.
   - `client: native`: `sessionToken` in the body, once. Store in Keychain/Keystore.
3. Sessions slide: 30 days idle, 90 days absolute. `last_seen_at` is rewritten at most hourly.
4. `POST /v1/auth/logout` sets `revoked_at` and clears the cookie. `GET /v1/me` returns the
   account and its memberships.

Not yet: Apple/Google OIDC, native provider tokens, rate limiting on the request endpoint,
refresh-token rotation for native (the native session token currently has the same lifetime
rules as the web cookie). All are tracked in `feature-status.json`.

### Organizations

`POST /v1/orgs` inserts the directory row and an `owner` membership in one D1 batch, then binds
the Durable Object (`bind(organizationId)` stores the id so the object can refuse a mismatch).
`GET /v1/orgs` lists the caller's memberships as organizations with their role.

### Authorization

`authenticate` middleware (every `/v1/*` request) resolves cookie or bearer into `c.var.auth`.
Routes call `requireAuth` (401) and `requireOrgRole(env, auth, orgId, minimum)` (403).
Role rank: `member < leader < organizer < owner`. A missing membership and an unknown organization
produce the same 403 so existence is not disclosed.

| Route | Minimum role |
|---|---|
| `POST /v1/orgs/{orgId}/trips` | organizer |
| `GET /v1/orgs/{orgId}/trips` | member |
| `POST .../roster/import` | organizer |
| `GET .../roster` | leader |
| `POST .../invites` | organizer |
| `POST /v1/invites/redeem` | any signed-in account |

### Roster import

CSV body (`{csv}`) parsed by `src/lib/csv.ts`: RFC 4180 quoting, BOM and CRLF tolerant,
limits 64 KiB / 2000 rows / 2 KiB per row / 32 fields. Columns `name` (required), `group`,
`guardian_name`, `guardian_contact`. Each row becomes a `traveler` participation; a non-empty
`guardian_name` adds a `guardian` participation with `guardian_of` = the traveler's id.
`guardian_contact` is not persisted in this slice (it will feed invite emails later). Rows the
parser rejects are returned in `skipped` with line numbers; the rest import atomically.

### Invites

`POST .../invites` issues one code per participation that has no account and no live code.
Code: 8 symbols from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, shown as `XXXX-XXXX`, valid 30 days.
Normalization on redeem drops dashes and case. Only the hash is stored; the plaintext is returned
once.

`POST /v1/invites/redeem {code}`:
1. 404 if unknown, expired, or revoked; 409 if already redeemed.
2. Atomic claim (`UPDATE ... WHERE redeemed_at IS NULL`).
3. `OrgDurableObject.bindAccount` links the participation; a row already bound to another
   account is 409.
4. Membership: `leader` invites grant org role `leader`; `traveler`/`guardian` grant `member`.
   `InviteRole` cannot express `owner` or `organizer`, and the test "a leader invite grants
   leader org role ... and never organizer" proves a leader cannot create trips or import.

## Local development

```sh
pnpm --filter @voysemble/api-worker dev          # wrangler dev with local D1/DO/KV
pnpm --filter @voysemble/api-worker test         # vitest in workerd; migrations applied per file
pnpm --filter @voysemble/api-worker exec wrangler d1 migrations apply voysemble-local --local
```

In `wrangler dev`, magic-link emails land in the local KV namespace; read them with
`wrangler kv key list --binding DEV_MAILBOX --local`.

## Open items

- Leader participations have no HTTP endpoint yet (test uses the DO method `addLeader`).
- Invite email delivery (guardian contact) and invite revocation endpoint.
- Organizer-facing web screens for onboarding checklist (D26) are slice 007 candidates.
