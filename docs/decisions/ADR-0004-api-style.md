# ADR-0004: API style — OpenAPI-first REST, no GraphQL

Status: accepted (2026-10-10)

## Decision

- Hono on Workers with `zod-openapi`. Zod schemas are the single source of truth.
- Generated OpenAPI 3.1 spec committed under `packages/contracts/openapi/`.
- Clients generated from the spec: Kotlin (KMP core), Swift types where needed, TypeScript (web).
- Mobile sync is a cursor/delta protocol (`GET /v1/trips/{id}/sync`, `POST /v1/trips/{id}/mutations`),
  not ad-hoc queries.
- Realtime via TripLiveDO WebSockets with a short-lived ticket.

## Why not GraphQL

- Role-scoped responses are simpler per endpoint.
- Resolver N+1 against a single-threaded DO is a footgun.
- Query depth/cost limiting is extra attack surface for one client team.
- Native clients want generated typed models, which OpenAPI gives directly.
- "Journey Graph" is a domain model, not a query language.
