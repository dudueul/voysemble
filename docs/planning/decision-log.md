# Voysemble decision log

Working branch: `next`. Direct commits while scaffolding. No PR cycle.

Status legend: `open` (being grilled), `decided`, `deferred`.

| # | Topic | Status | Decision | Why |
|---|---|---|---|---|
| D01 | Product boundary | decided | Single-operator platform (founder only), org-scoped data. Build docs 01-03 product. Doc 00 = security posture source. Encryption in tiers: ops data plaintext in D1; PII fields AES-256-GCM with per-org DEK wrapped by Worker-secret master key; documents in R2 ciphertext with seam for owner-held key later; live coords ephemeral in DO only. Stripe web-only, organizers only, hosted Checkout + Portal, no card data. Admin = Cloudflare Access + single staff identity + audit + reauth. | Server needs ops plaintext for role filtering, sync, fanout, graph. Full E2E kills those. PII/doc encryption still defeats DB/backup leak. |
| D02 | Mobile client runtime: native (SwiftUI/Compose) vs React Native/Expo | open | | |
| D03 | Workers AI usage boundary | open | | |
| D04 | Auth provider and session model | open | | |
| D05 | First milestone and visual acceptance screens | open | | |

## Inputs

- `docs/references/00_travel-agency-like.md`: single-owner, E2E-encrypted agency ops tool. Security principles source.
- `docs/references/01_Voysemble_Prototype_Architecture.md`: multi-tenant SaaS architecture, Cloudflare-first, Stripe, RN+Expo.
- `docs/references/02_*`, `03_*`: coding-agent starting prompts; 03 adds engineering execution graph contract.
- `docs/visual-references/*.webp`: screen atlas (15 mobile pairs) and 28-screen gallery incl. web console. Visual direction only.

## Baseline (2026-10-10)

- Repo empty at start. No code, no lockfile, no CI.
- Toolchain in sandbox: Node 22.22, pnpm 10.28, npm 10.9. No wrangler installed yet.
- No Cloudflare, Stripe, Apple, or Google credentials present. Local-only work until granted.
