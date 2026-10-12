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

## Web console (slice 007)

- `src/lib/api-client.ts`: same-origin `fetch` with `credentials: same-origin`; non-2xx becomes
  `ApiError{status, code, correlationId, details}`. Screens show the correlation id as a support
  reference.
- `src/lib/session.ts`: query options (`meQuery`, `orgsQuery`, `tripsQuery`, `rosterQuery`),
  `auth.*` and `setup.*` mutations, remembered active organization in `localStorage`.
- Router: `/sign-in` and `/auth/verify` are public. Every other route is a child of the pathless
  `app` layout whose `beforeLoad` calls `GET /v1/me` through the shared QueryClient and redirects
  to `/sign-in` on 401. The verify page reads `#token=` from the fragment, posts it with
  `client: web`, strips the fragment with `history.replaceState`, and navigates to `/setup`.
- `/setup`: four-step checklist (org, trip, roster, invites) that re-derives its state from the
  API on every load. Invite codes are rendered once and offered as a CSV download; nothing keeps
  them client-side after navigation.
- Browser E2E runs against `wrangler dev` with the fixture mailbox and reads magic links from
  `/v1/dev/mailbox`, which exists only in the local environment.

## People page on the API (slice 023)

The console's People page reads the roster of the active organization's first trip and renders
it live (the "Live" chip replaces "Sample data"); without an organization or a trip the fixture
stays. Exercised by `apps/api-worker/test/roster-invites.test.ts` ("roster entries for the
People page"), `apps/organizer-web/src/lib/people-model.test.ts`, the live case in
`sections.test.tsx`, and `apps/organizer-web/e2e/people.spec.ts`.

### Roster entries

`GET .../roster` now returns `RosterEntry` rows: the participation plus two computed facts.

| Field | Source | Values |
|---|---|---|
| `invite` | `inviteStatusOf(accountId, codes, now)` in `routes/roster.ts`, over the trip's `invite_codes` rows in D1 (one query by trip id, no bound-parameter list: D1 caps parameters per statement) | `joined` once an account redeemed the code; `issued` while an unredeemed, unrevoked code is still valid; `expired` when every open code has passed its expiry; `none` before any code |
| `lastAckAt` | `OrgDurableObject.listRosterWithAcks`: a correlated `MAX(received_at)` over `acks` per participation | server receipt time of the latest acknowledgment, or null |

Callers of the roster that only need participations (dashboard, setup checklist) keep working:
an entry is a participation with two more fields.

### Console

`lib/people-model.ts` (`buildPeople`) maps entries to rows (join status `joined`, `invited`,
`expired`, `pending`; the guardian's traveler name resolved from the same list; `hasCareNote`
always false until D27) and totals (travelers, guardians, leaders, joined, not joined) plus the
distinct group names for the filter chips. `PeoplePage` renders one table for both modes:
role and group filters, "Last ack" relative to the real clock in live mode (the frozen fixture
clock in sample mode), a dash in the care-note column with a tooltip saying D27 is a later
slice, and "Issue invites" as a link to the setup checklist, the one place codes are issued
(D26). Loading, failed and empty states replace the table and keep the frame.

### Facts established by tests

- Worker: after import every row is `none` with no ack; after issuing codes every row is
  `issued`; after Minji redeems and acknowledges an announcement her row is `joined` with her
  account id and a timestamp while the others stay `issued` with null; `inviteStatusOf` prefers
  a live code over expired ones and ignores redeemed and revoked codes.
- Console unit: the model maps the four statuses, resolves the guardian binding, never invents a
  care note, and counts; the live page shows "Live" and not "Sample data", the three tiles,
  "Joined", "Invited", "Code expired", "5 min ago", "guardian of Minji Park", no reveal button,
  and the Bus B filter narrows to one row with "Showing 1 of 3 people."; the fixture page still
  filters as before.
- Browser (desktop 1440, laptop 1280): with a trip and the sample CSV the page is live with
  "3 travelers · 2 guardians · 0 leaders", joined 0, groups 2, not joined 5, five "Code not
  issued" rows and the guardian binding; issuing codes and reloading shows five "Invited";
  Guardians then Bus B filters narrow to Hana Mom; the invite action links to `/setup`.
  Capture `people-live.png`.

## Open items

- Invite revocation endpoint; roster row editing and removal; per-person card and timeline (D17); care notes (D27).
- Invite email delivery (guardian contact) and invite revocation endpoint.
- Organizer-facing web screens for onboarding checklist (D26) are slice 007 candidates.
