# Voysemble decision log

Working branch: `next`. Direct commits while scaffolding. No PR cycle.

Status legend: `open` (being grilled), `decided`, `deferred`.

| # | Topic | Status | Decision | Why |
|---|---|---|---|---|
| D01 | Product boundary | decided | Single-operator platform (founder only), org-scoped data. Build docs 01-03 product. Doc 00 = security posture source. Encryption in tiers: ops data plaintext in D1; PII fields AES-256-GCM with per-org DEK wrapped by Worker-secret master key; documents in R2 ciphertext with seam for owner-held key later; live coords ephemeral in DO only. Stripe web-only, organizers only, hosted Checkout + Portal, no card data. Admin = Cloudflare Access + single staff identity + audit + reauth. | Server needs ops plaintext for role filtering, sync, fanout, graph. Full E2E kills those. PII/doc encryption still defeats DB/backup leak. |
| D02 | Mobile client runtime | decided | Kotlin Multiplatform core (API client, sync, offline SQLite, crypto, domain rules) + SwiftUI + Jetpack Compose. No JS runtime in app. ADR-0003. | Minimal supply chain, OS-level background reliability, native look. Sync/crypto written once. |
| D03 | Workers AI usage boundary | open | | |
| D04 | Auth provider and session model | open | | |
| D05 | First milestone and visual acceptance screens | open | | |
| D06 | Storage topology | decided | Global D1 (identity, org directory, billing, staff audit, rollups) + OrgDO SQLite canonical per org + TripLiveDO per trip (sockets, presence, coords, chat stream) + R2 longitudinal archive + KV config. Drizzle ORM. No PlanetScale. ADR-0002. | Isolation by construction, real transactions, co-located compute, $0.20/GB-mo, zero ops. Cross-org via rollups. |
| D07 | API style | decided | OpenAPI-first REST via Hono + zod-openapi; generated Kotlin/Swift/TS clients. No GraphQL. ADR-0004. | Role-scoped endpoints, native codegen, no resolver N+1 on DO, less attack surface. |
| D08 | Key hierarchy, rotation, PQ | decided | KEK (Worker secret) wraps per-org versioned DEKs; envelope with keyVersion; lazy + async re-encrypt; crypto-shred on org delete. Symmetric-only at rest, HMAC tokens, hybrid X25519+ML-KEM when asymmetric needed. ADR-0005. | Rotation without mass rewrite; PQ-ready by construction. |
| D09 | Source headers | decided | Every source file starts with `Copyright 2026- At Day. All rights reserved.` CI header lint. See docs/engineering/source-headers.md. | Founder requirement. |

## Inputs

- `docs/references/00_travel-agency-like.md`: single-owner, E2E-encrypted agency ops tool. Security principles source.
- `docs/references/01_Voysemble_Prototype_Architecture.md`: multi-tenant SaaS architecture, Cloudflare-first, Stripe, RN+Expo.
- `docs/references/02_*`, `03_*`: coding-agent starting prompts; 03 adds engineering execution graph contract.
- `docs/visual-references/*.webp`: screen atlas (15 mobile pairs) and 28-screen gallery incl. web console. Visual direction only.

## Baseline (2026-10-10)

- Repo empty at start. No code, no lockfile, no CI.
- Toolchain in sandbox: Node 22.22, pnpm 10.28, npm 10.9. No wrangler installed yet.
- No Cloudflare, Stripe, Apple, or Google credentials present. Local-only work until granted.
