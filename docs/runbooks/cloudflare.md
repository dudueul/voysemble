# Cloudflare: domains, resources, secrets, email, deploy

Covers steps 2 to 6 and 10 of `README.md`. Hostnames and environments are fixed by ADR-0008;
email by ADR-0007. Every command runs from `apps/api-worker` unless it says otherwise, with
`pnpm exec wrangler …` (the pinned Wrangler in the repo, never a global one).

## 1. Account and zones

Preconditions: a Cloudflare account owned by the operating legal entity (not a personal one you
might leave), with two-factor authentication on.

1. Add the zone `voysemble.com` (production) and change the registrar's nameservers to the two
   Cloudflare gives you. Wait until the dashboard shows the zone as Active.
2. Add the zone `voysemble.cfd` (development and previews; ADR-0008). Same nameserver step.
3. Enable the Workers Paid plan on the account. Durable Objects with SQLite storage, the cron
   trigger and Workers AI are used by every environment.
4. Note the **account id** (dashboard, right column of any zone's Overview).

Verify: both zones Active; `dig NS voysemble.com +short` lists Cloudflare nameservers.

Evidence to keep: a screenshot of both zones Active, the plan page.

## 2. Hostnames you will see

Created automatically by the first deploy of each Worker (Workers Custom Domains create the DNS
record and the certificate). Do not create these DNS records by hand.

| Surface | Production | Staging |
|---|---|---|
| Public site | `voysemble.com`, `www.voysemble.com` | `www.staging.dev.voysemble.cfd` |
| Organizer console and its API | `app.voysemble.com` | `staging.dev.voysemble.cfd` |
| API for the phones | `api.voysemble.com` | `api.staging.dev.voysemble.cfd` |

Per-build previews use `<build>.dev.voysemble.cfd` and are optional for the pilot. ADR-0008 notes
one risk to check at the first deploy: two-label hosts under `dev.voysemble.cfd` need a
certificate per hostname; if the zone refuses, previews fall back to single labels
(`api-<build>`).

## 3. A scoped API token for CI

Dashboard → My Profile → API Tokens → Create Token → Custom token.

| Permission | Scope |
|---|---|
| Account · Workers Scripts · Edit | the account |
| Account · D1 · Edit | the account |
| Account · Workers R2 Storage · Edit | the account |
| Account · Account Settings · Read | the account |
| Zone · Workers Routes · Edit | `voysemble.com`, `voysemble.cfd` |
| Zone · DNS · Edit | `voysemble.com`, `voysemble.cfd` |

Set an expiry (a year) and, if your CI runs from fixed addresses, an IP filter. If a deploy
later fails naming a missing permission, add only that one.

Then in GitHub → the repository → Settings → Secrets and variables → Actions:

- Secret `CLOUDFLARE_API_TOKEN`: the token.
- Secret `CLOUDFLARE_ACCOUNT_ID`: the account id from §1.

Rollback: revoke the token in the dashboard; nothing else depends on it.

## 4. Databases and buckets (once per environment)

With the token in your shell (`export CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=…`):

```sh
pnpm exec wrangler d1 create voysemble-staging
pnpm exec wrangler d1 create voysemble-prod
pnpm exec wrangler r2 bucket create voysemble-media-staging
pnpm exec wrangler r2 bucket create voysemble-media-prod
```

Each `d1 create` prints a `database_id`. Store them as GitHub Actions **variables** (not
secrets; they are not sensitive): `D1_ID_STAGING`, `D1_ID_PRODUCTION`. The committed config
carries the placeholder `__D1_ID__`, which the deploy workflow fills (§7); never edit the
committed `wrangler.jsonc` by hand.

Apply the schema (seven migrations today, `migrations/0001` to `0007`), staging first:

```sh
pnpm exec wrangler d1 migrations apply voysemble-staging --env staging --remote
```

Production gets the same command with `voysemble-prod --env production` at §9, not before.

The buckets stay private: no public access, no custom domain. Photos and document scans are
sealed before they are stored (ADR-0001, ADR-0005).

Verify: `pnpm exec wrangler d1 migrations list voysemble-staging --env staging --remote` shows
every migration applied; `pnpm exec wrangler r2 bucket list` shows both buckets.

## 5. Secrets (once per environment)

Two keys seal care notes and media (photos, document scans). Each is 32 random bytes,
base64-encoded. Generate a different pair per environment and never reuse staging's in
production.

```sh
openssl rand -base64 32 | pnpm exec wrangler secret put CARE_NOTE_KEY --env staging
openssl rand -base64 32 | pnpm exec wrangler secret put MEDIA_KEY --env staging
```

Repeat with `--env production` at §9. Without them, care-note writes and photo uploads answer
503 in that environment by design (`src/env.ts`).

**Back the production keys up before the first real data.** Losing `MEDIA_KEY` makes every
stored photo and scan unreadable; there is no recovery. Keep the backup in your password manager
under the operating entity, not on a laptop. The per-organization key ring that replaces these
single keys is a later slice (ADR-0005).

Optional variables, set with `wrangler secret put … --env <env>` or in the dashboard:

| Name | Value | When |
|---|---|---|
| `AI_GATEWAY_ID` | the AI Gateway's id | to route translation through AI Gateway (ADR-0006) |
| `APPLE_APP_IDS` | `TEAMID.com.voysemble.app` | after `apple.md` §2, for Universal Links |
| `ANDROID_CERT_SHA256` | comma-separated SHA-256 fingerprints | after `google.md` §2, for App Links |

## 6. Email sending (both domains)

Sign-in is by emailed link (ADR-0007): until a real transport is bound, nobody can sign in
outside local development. The digest, organizer invitations, step-up confirmations and the
incident emails use the same transport.

1. In the dashboard, open the email sending product for `voysemble.com`. ADR-0007 chose
   Cloudflare Email Sending (the Workers `send_email` binding / Email Service); confirm it is
   available on your account and can send to any recipient (not only verified addresses). If it
   is not, tell engineering: ADR-0007's fallback is a `ResendEmailPort` behind a flag.
2. Let the onboarding add the DNS records it asks for: SPF (TXT), DKIM (TXT or CNAME), and a
   DMARC record. Start DMARC at `p=none; rua=mailto:dmarc@voysemble.com` and move to
   `p=quarantine` after two clean weeks.
3. Sender addresses: `no-reply@voysemble.com` for production, `no-reply@dev.voysemble.cfd` for
   staging and previews (ADR-0008: non-production sends from its own domain).
4. Do the same for `dev.voysemble.cfd`.
5. Tell engineering the binding name you chose (default `EMAIL`) and the two sender addresses.

ADR-0008 also requires non-production email to go only to founder-owned addresses; engineering
enforces that allowlist in the port, configured by a staging variable `EMAIL_ALLOWLIST`
(comma-separated addresses).

Verify (after §7–8): request a sign-in link at `https://staging.dev.voysemble.cfd`, receive it,
check the message headers show `spf=pass`, `dkim=pass`, `dmarc=pass`.

## 7. What engineering builds once §1–6 exist

- A GitHub Actions deploy workflow: on push to `next` it builds the console and the public
  site, fills `__BUILD_ID__` and `__D1_ID__` from the run and the variables in §4, applies D1
  migrations, and deploys both Workers to staging; production deploys only from a manual
  approval (ADR-0008).
- `CloudflareEmailPort` and the binding in `wrangler.jsonc` for staging and production, with the
  non-production allowlist; `FixtureEmailPort` stays for local and tests.
- The phones' debug builds point at `api.next.dev.voysemble.cfd` today; they move to
  `api.staging.dev.voysemble.cfd` so one staging serves the console and the test phones.

## 8. First staging deploy and rehearsal

After the workflow lands, a push to `next` deploys. To deploy by hand once (from the repo root):

```sh
pnpm --filter @voysemble/organizer-web build
cd apps/api-worker && pnpm exec wrangler deploy --env staging   # after the workflow's substitution
cd ../public-web && SITE_URL=https://www.staging.dev.voysemble.cfd BUILD_ID=$(git rev-parse --short HEAD) pnpm build && pnpm exec wrangler deploy --env staging
```

Set the GitHub secret `CF_ANALYTICS_TOKEN` only if you want Web Analytics on the public site;
without it the pages carry no beacon.

Rehearsal, on staging with synthetic data only (ADR-0008: no production data elsewhere): walk
the demonstration script of the architecture reference §30 with two browsers and two phones:
create the organization, import the sample roster, issue invites, redeem on a phone, publish
the itinerary, acknowledge, run a head count that leaves one person missing, answer the
incident from the phone, send the guardian message, resolve. Keep the run's notes as evidence.

## 9. Production (only on your explicit approval)

Preconditions: staging rehearsal passed; production secrets backed up (§5); the legal items in
`legal-and-pilot.md` answered; email verified on `voysemble.com`.

```sh
pnpm exec wrangler d1 migrations apply voysemble-prod --env production --remote
openssl rand -base64 32 | pnpm exec wrangler secret put CARE_NOTE_KEY --env production
openssl rand -base64 32 | pnpm exec wrangler secret put MEDIA_KEY --env production
```

Then approve the production job of the deploy workflow.

Verify: `https://voysemble.com` serves the site; `https://app.voysemble.com` serves the sign-in;
`https://api.voysemble.com/openapi.json` answers; a sign-in link arrives.

## 10. Rollback

- **Code**: `pnpm exec wrangler deployments list --env production`, then
  `pnpm exec wrangler rollback <version-id> --env production`. Same for the public site Worker.
- **Data** is not rolled back by a code rollback. Migrations are expand-then-contract
  (architecture reference §25), so the previous code version runs on the newer schema.
  Restoring D1 to an earlier point (`wrangler d1 time-travel restore`) is a disaster-recovery
  action that loses writes after that point; do it only on purpose, with the time noted.
- **Secrets**: rotating `MEDIA_KEY` or `CARE_NOTE_KEY` makes existing sealed data unreadable
  until key rotation exists (ADR-0005); never rotate them as a rollback step.
