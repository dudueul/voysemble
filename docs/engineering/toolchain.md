# Toolchain (pinned 2026-10-10)

| Tool | Version | Why |
|---|---|---|
| Node | 22 (`.node-version`) | Workers tooling baseline |
| pnpm | 10.28.0 (`packageManager`) | Workspace + catalog pins. Postinstall allowed only for `esbuild`, `workerd` |
| TypeScript | 5.9.3 | 7.x (native) exists; stay on 5.x until vitest/biome/wrangler confirm 7 support |
| Biome | 2.5.15 | Lint + format, one binary, no plugin tree |
| Hono | 4.13.13 | HTTP layer |
| @hono/zod-openapi | 1.6.3 | Routes from Zod, OpenAPI 3.1 |
| Zod | 4.6.5 | Contracts |
| Wrangler | 4.149.0 | Dev, types, deploy |
| Vitest | 4.1.11 | `@cloudflare/vitest-plugin` 1.4.0 requires ^4.1 or ^5 |
| @cloudflare/vitest-plugin | 1.4.0 | Tests inside workerd. Successor of `vitest-pool-workers` |
| drizzle-orm | 0.45.4 | Typed queries on D1 (`drizzle-orm/d1`); DO SQLite uses `ctx.storage.sql` directly with the same table names |
| @oslojs/crypto, @oslojs/encoding | 1.0.1, 1.1.0 | SHA-256 and base64url/hex for tokens (ADR-0007) |

Versions live in `pnpm-workspace.yaml` `catalog:`; packages reference `catalog:`. Bump in one place.

Commands

```sh
pnpm check                 # lint, typecheck, test, script tests, header lint (CI runs the same)
pnpm --filter @voysemble/api-worker dev
pnpm --filter @voysemble/design-tokens build
```

Mobile toolchain and test tiers: `docs/engineering/mobile-build-and-test.md`.
