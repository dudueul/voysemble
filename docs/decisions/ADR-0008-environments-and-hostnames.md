# ADR-0008: Environments, hostnames, and per-build previews

Status: accepted (2026-10-10)

## Domains

- Production: `voysemble.com` (owned by founder).
- Development/preview: `voysemble.<build>.dev.vida.re` where `<build>` is a short git SHA,
  a branch slug (`next`), or another agreed symbol. `dev.vida.re` zone is on Cloudflare.

## Hostname scheme

| Surface | Production | Preview (`<build>`) | Staging |
|---|---|---|---|
| Public site | `voysemble.com`, `www.voysemble.com` | `www-voysemble.<build>.dev.vida.re` | `www-voysemble.staging.dev.vida.re` |
| Organizer app + API (same Worker) | `app.voysemble.com` | `voysemble.<build>.dev.vida.re` | `voysemble.staging.dev.vida.re` |
| API for native clients | `api.voysemble.com` (same Worker, second route) | `api-voysemble.<build>.dev.vida.re` | `api-voysemble.staging.dev.vida.re` |
| Admin console + admin API (separate Worker, Cloudflare Access) | `admin.voysemble.com` | `admin-voysemble.<build>.dev.vida.re` | `admin-voysemble.staging.dev.vida.re` |
| Public assets (R2 custom domain) | `assets.voysemble.com` | shared `assets-voysemble.dev.dev.vida.re` (content-addressed keys, immutable, safe to share across builds) | `assets-voysemble.staging.dev.vida.re` |
| Stripe webhooks | `api.voysemble.com/webhooks/stripe` | per-build endpoint registered only when a sandbox key is present | staging endpoint |

Rationale for the organizer app and its API on one origin: host-only cookies and no CORS for
the web client. Native clients use the `api-` host with bearer tokens. Admin is always a
separate origin and a separate Worker; its cookies never reach the app origin.

Hyphenated single-label prefixes (`admin-voysemble.<build>`) keep every preview hostname one
label deep under `<build>.dev.vida.re`, so Workers Custom Domains provisions certificates per
hostname automatically. Verify Custom Domains behavior for multi-level labels at first deploy.

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
- Email sending: production from `voysemble.com`; non-production from `dev.vida.re` with its
  own SPF/DKIM/DMARC. Non-production email is additionally allowlisted to founder-owned
  addresses.
- Mobile builds select the backend by flavor: `debug` (in-app dev menu, defaults to the
  `next` preview), `staging`, `release` (production only, no override).
- No certificate pinning in native apps (Cloudflare rotates certificates). Rely on platform TLS,
  Certificate Transparency, and App Transport Security.

## Accepted intake defaults (unchanged from the proposal)

- Cloudflare account access for the coding agent: none now. Local-only until a scoped API
  token is provided. Founder deploys previews or grants a token limited to `dev.vida.re`
  resources.
- Stripe: fixture adapter and recorded webhook fixtures until sandbox keys are added.
- iOS: Swift builds only on founder's macOS/CI. Kotlin core and Compose build in Linux CI.
- Languages: KO, JA, EN. English is the source language.
- Synthetic data: Korea Concert Tour, 38 travelers, 2 buses, ICN -> FCO, Asia/Seoul and
  Europe/Rome.
- Maps: MapKit (iOS), Google Maps SDK or MapLibre (Android, decide at spike), MapLibre on web
  with a "simulated map data" label until a tile license is chosen.
- Push: APNs and FCM from the Worker, fixture adapter first.
