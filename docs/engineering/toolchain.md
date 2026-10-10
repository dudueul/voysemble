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

Versions live in `pnpm-workspace.yaml` `catalog:`; packages reference `catalog:`. Bump in one place.

Commands

```sh
pnpm check                 # lint, typecheck, test, script tests, header lint (CI runs the same)
pnpm --filter @voysemble/api-worker dev
pnpm --filter @voysemble/design-tokens build
```
