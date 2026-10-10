# @voysemble/contracts

Zod schemas for every external contract (requests, responses, error envelope). The API Worker
mounts them into `@hono/zod-openapi` routes; the generated `openapi.json` feeds Kotlin, Swift,
and TypeScript client generation (ADR-0004).

Rules

- Pure schemas. No runtime, no persistence, no provider SDKs.
- Add codes to `ErrorCode`, never rename them. Clients switch on them.
- Every schema gets `.openapi('Name')` so it becomes a named component.

Run: `pnpm --filter @voysemble/contracts typecheck`
