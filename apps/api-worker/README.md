# @voysemble/api-worker

Customer API Worker. Serves the organizer web app (static assets, later) and the `/v1/*` API
for web and native clients on the same Worker (ADR-0008). Hono + `@hono/zod-openapi`.

Owns: HTTP boundary, middleware, error envelope, OpenAPI document, route mounting.
Does not own: business rules (modules), persistence (capability stores), provider SDKs (adapters).

Commands

```sh
pnpm --filter @voysemble/api-worker dev        # wrangler dev on http://localhost:8787
pnpm --filter @voysemble/api-worker test       # vitest inside workerd
pnpm --filter @voysemble/api-worker typecheck  # wrangler types + tsc
```

Routes

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/v1/health` | none | env name, build id, time |
| GET | `/openapi.json` | none | OpenAPI 3.1 generated from contracts |

Every response carries `X-Correlation-Id`. Every error body is `ErrorEnvelope`.
