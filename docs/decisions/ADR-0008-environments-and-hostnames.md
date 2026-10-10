# ADR-0008: Environments, hostnames, and per-build previews

Status: accepted (2026-10-10)

## Domains

- Production: `voysemble.com` (owned by founder).
- Development/preview suffix: `dev.voysemble.cfd` (changed 2026-10-10 from `dev.vida.re`).
  Preview hosts are `<build>.dev.voysemble.cfd` where `<build>` is a short git SHA, a branch
  slug (`next`), or another agreed symbol. `voysemble.cfd` zone is on Cloudflare.

## Hostname scheme

| Surface | Production | Preview (`<build>`) | Staging |
|---|---|---|---|
| Public site | `voysemble.com`, `www.voysemble.com` | `www.<build>.dev.voysemble.cfd` | `www.staging.dev.voysemble.cfd` |
| Organizer app + API (same Worker) | `app.voysemble.com` | `<build>.dev.voysemble.cfd` | `staging.dev.voysemble.cfd` |
| API for native clients | `api.voysemble.com` (same Worker, second route) | `api.<build>.dev.voysemble.cfd` | `api.staging.dev.voysemble.cfd` |
| Admin console + admin API (separate Worker, Cloudflare Access) | `admin.voysemble.com` | `admin.<build>.dev.voysemble.cfd` | `admin.staging.dev.voysemble.cfd` |
| Public assets (R2 custom domain) | `assets.voysemble.com` | shared `assets.dev.voysemble.cfd` (content-addressed keys, immutable, safe to share across builds) | `assets.staging.dev.voysemble.cfd` |
| Stripe webhooks | `api.voysemble.com/webhooks/stripe` | per-build endpoint registered only when a sandbox key is present | staging endpoint |

Rationale for the organizer app and its API on one origin: host-only cookies and no CORS for
the web client. Native clients use the `api-` host with bearer tokens. Admin is always a
separate origin and a separate Worker; its cookies never reach the app origin.

Preview hostnames are two labels deep under `dev.voysemble.cfd` (`api.<build>.dev.voysemble.cfd`).
Workers Custom Domains provisions a certificate per hostname, so depth is not a wildcard-cert
problem. Verify at first deploy; fall back to hyphenated single labels (`api-<build>`) if the
zone's certificate setup rejects the depth.

## Environments

| Env | Created by | D1 | DO namespaces | R2 buckets | KV | Secrets | Stripe | Lifetime |
|---|---|---|---|---|---|---|---|---|
| local | `wrangler dev` / Miniflare | local sqlite | local | local | local | `.dev.vars` (gitignored) | fixture | session |
| preview | CI on push to a branch | per-build (`voysemble-<build>`) | per-build | per-build private, shared public dev assets | per-build | from CI env, scoped | fixture or sandbox | deleted on branch delete + 7 days |
| staging | CI on push to `next` | `voysemble-staging` | staging | staging set | staging | staging | sandbox | persistent |
| production | manual approval from `main` | `voysemble-prod` | prod | prod set | prod | prod | live | persistent |

Rules:
- Wrangler `env.<name>` blocks are generated from one template; `<build>` substitution happens
  in CI, never by hand-editing committed config.
- No production data in any other environment. Preview seeds use the synthetic Korea Concert
  Tour fixture only.
- Email sending: production from `voysemble.com`; non-production from `dev.voysemble.cfd` with
  its own SPF/DKIM/DMARC. Non-production email is additionally allowlisted to founder-owned
  addresses.
- Mobile builds select the backend by flavor: `debug` (in-app dev menu, defaults to the
  `next` preview), `staging`, `release` (production only, no override).
- No certificate pinning in native apps (Cloudflare rotates certificates). Rely on platform TLS,
  Certificate Transparency, and App Transport Security.

## Accepted intake defaults (unchanged from the proposal)

- Cloudflare account access for the coding agent: none now. Local-only until a scoped API
  token is provided. Founder deploys previews or grants a token limited to `voysemble.cfd`
  resources.
- Stripe: fixture adapter and recorded webhook fixtures until sandbox keys are added.
- iOS: Swift builds only on founder's macOS/CI. Kotlin core and Compose build in Linux CI.
- Languages: KO, EN. English is the source language. JA dropped from scope (founder decision 2026-10-10); i18n framework stays locale-agnostic so JA can be added later.
- Synthetic data: Korea Concert Tour, 38 travelers, 2 buses, ICN -> FCO, Asia/Seoul and
  Europe/Rome.
- Maps: MapKit (iOS), Google Maps SDK or MapLibre (Android, decide at spike), MapLibre on web
  with a "simulated map data" label until a tile license is chosen.
- Push: APNs and FCM from the Worker, fixture adapter first.
