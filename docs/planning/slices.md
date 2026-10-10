# Slice ledger

One entry per approved slice. Evidence names commands, exit status, and runtime. "Passed" means it ran.

## Slice 001: monorepo scaffold + API Worker health + OpenAPI + header lint + CI

Status: done 2026-10-10. Commit: see git log (`chore: scaffold ...`).

| Gate | Command | Result |
|---|---|---|
| Lint + format | `pnpm lint` (Biome 2.5.15) | 28 files checked, 0 errors |
| Typecheck | `pnpm typecheck` (tsc 5.9.3, `wrangler types` generated bindings) | contracts + api-worker pass, test tsconfig pass |
| Worker tests | `pnpm --filter @voysemble/api-worker test` (vitest 4.1.11 inside workerd via `@cloudflare/vitest-plugin` 1.4.0) | 3 files, 5 tests passed |
| Script tests | `pnpm test:scripts`, `pnpm --filter @voysemble/design-tokens test` (node:test) | 6 + 4 passed |
| Header lint | `pnpm check:headers` | ok on all tracked files |

Facts established by tests:
- `GET /v1/health` returns 200 and a body that parses with `HealthResponse`; `envName=local`, `buildId=local`.
- `X-Correlation-Id` is generated when absent and preserved when well-formed.
- `/openapi.json` is OpenAPI 3.1 and lists `/v1/health`, `HealthResponse`, `ErrorEnvelope`.
- Unknown routes return the `ErrorEnvelope` with `NOT_FOUND` and the correlation id inside.
- `X-Content-Type-Options: nosniff` and `X-Frame-Options: SAMEORIGIN` on every response.
- Header lint accepts shebang-first files, CSS block form; exempts JSON, markdown, lockfile, generated types, reference docs.
- Token generator resolves references, throws on unresolved, emits header + ARGB literals for Kotlin/Swift.

Deviations found while building:
- `@cloudflare/vitest-pool-workers` is deprecated; replaced by `@cloudflare/vitest-plugin` (Vite plugin `cloudflareTest`). Docs in refs predate this.
- Biome 2.5 uses `rules.preset` not `rules.recommended`.
- pnpm 10 blocks postinstall scripts; `onlyBuiltDependencies: [esbuild, workerd]` in `pnpm-workspace.yaml`.
- `@types/node` required once `nodejs_compat` is on.

Not done (next slices): no DB, no auth, no mobile code, no web app, no deploy. CI workflow is committed but unverified until pushed.

## Slice 002 (next): KMP core skeleton + Compose shell + Xcode project skeleton

Planned. Contract to be written before start.
