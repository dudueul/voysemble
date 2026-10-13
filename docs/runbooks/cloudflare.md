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

Apply the schema (eight migrations today, `migrations/0001` to `0008`; the deploy workflow
applies them on every run, §7), staging first:

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

## 7. The deploy workflow (built, slice 089) and what engineering still builds

`.github/workflows/deploy.yml`, one job used two ways:

- **Staging, automatic.** `ci.yml`'s `deploy-staging` job calls it after every push to `next`
  whose `web`, `mobile` and `ios` jobs passed. Until `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID` (§3) and `D1_ID_STAGING` (§4) exist it does nothing and says so in the
  run summary ("Staging deploy skipped: missing …"); ci stays green.
- **Production, by hand only.** Actions → deploy → Run workflow on `next`, environment
  `production`, confirmation `deploy production`. It refuses any other branch, a commit whose
  `ci` run did not pass, a missing secret or `D1_ID_PRODUCTION`. Before the first production
  deploy, add yourself as a required reviewer: Settings → Environments → `production` →
  Required reviewers (the environment appears after the first staging run; create it by hand
  otherwise). The job then waits for your approval in the Actions tab.

Each run, in order: build the console and the public site (`SITE_URL` per environment, the short
commit as `BUILD_ID`, `CF_ANALYTICS_TOKEN` if set); `scripts/fill-wrangler.mjs` fills
`__BUILD_ID__` and `__D1_ID__` in its own checkout (and refuses a malformed id or a placeholder
left behind); `wrangler d1 migrations apply <db> --remote`; `wrangler deploy` for the API and
console Worker, then the public site Worker; a smoke check that `/v1/health` on the API host
answers this build's id, the console and `/openapi.json` answer, and the public site carries the
build id. Runs of one environment queue, never overlap.

The phones' debug builds point at `api.staging.dev.voysemble.cfd` and claim
`staging.dev.voysemble.cfd` for sign-in links (slice 089), so one staging serves the console and
the test phones.

Still to build before staging is useful end to end: `CloudflareEmailPort` and its binding for
staging and production, with the non-production allowlist (`EMAIL_ALLOWLIST`); until then a
sign-in request on staging fails (500: the named environments bind no email transport), so the
rehearsal (§8) waits for it.
`FixtureEmailPort` stays for local and tests.

## 8. First staging deploy and rehearsal

Once §3–4 exist, the next push to `next` deploys staging (or run the workflow by hand with
environment `staging`). Verify: the run summary says "Deployed <build> to staging" with the three
hosts. To deploy by hand from a throwaway checkout instead, from its root (never from your
working copy: the fill edits the configs in place):

```sh
pnpm --filter @voysemble/organizer-web build
SITE_URL=https://www.staging.dev.voysemble.cfd BUILD_ID=$(git rev-parse --short HEAD) pnpm --filter @voysemble/public-web build
node scripts/fill-wrangler.mjs apps/api-worker/wrangler.jsonc --build $(git rev-parse --short HEAD) --d1 <D1_ID_STAGING>
node scripts/fill-wrangler.mjs apps/public-web/wrangler.jsonc --build $(git rev-parse --short HEAD)
(cd apps/api-worker && pnpm exec wrangler d1 migrations apply voysemble-staging --env staging --remote && pnpm exec wrangler deploy --env staging)
(cd apps/public-web && pnpm exec wrangler deploy --env staging)
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

Then run the deploy workflow with environment `production` and the confirmation (§7), and
approve it when it waits for you. The workflow applies migrations itself; the command above is
for the first time only, to see the schema land before any code does.

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
