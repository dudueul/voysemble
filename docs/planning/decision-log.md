# Voysemble decision log

Working branch: `next`. Direct commits while scaffolding. No PR cycle.

Status legend: `open` (being grilled), `decided`, `deferred`.

| # | Topic | Status | Decision | Why |
|---|---|---|---|---|
| D01 | Product boundary: multi-tenant SaaS (docs 01/02/03) vs single-owner E2E agency tool (doc 00) | open | | |
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
