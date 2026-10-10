# ADR-0002: Storage topology — global D1 + OrgDO canonical + TripLiveDO + R2 archive

Status: accepted (2026-10-10). Supersedes doc 01 §6 "one D1 database per environment is canonical".

## Context

Options weighed: single D1 database; PlanetScale (Vitess MySQL or Postgres via Hyperdrive);
SQLite-backed Durable Object per organization.

Load profile: organizations × trips × 38–500 travelers. Small per org, unbounded org count.
Priorities from founder: scale without ops hassle, isolation, cost.

## Decision

```
Global D1 (small, cross-org only)
  users, identities, sessions, devices
  org directory: organization_id -> DO name, region hint, plan, status
  billing: orders, stripe_inbox, entitlements, credit_ledger, refund_requests
  staff_audit, feature_flags, cost_rollups, job_runs

OrgDO  (SQLite-backed Durable Object, canonical per organization)
  members, trips, rosters, PII (encrypted), itineraries, announcements, acks,
  headcount finals, journey graph, media metadata, org audit, outbox, schema_version

TripLiveDO (SQLite-backed Durable Object, ephemeral per trip)
  websocket sessions (hibernation), presence, coords with TTL, chat stream (ordered seq),
  headcount counter projection, catch-up ring buffer, per-trip rate limits

R2 (private buckets)
  media, documents, exports
  longitudinal archive: trip completed + N days -> sealed snapshot parts; rows pruned from OrgDO

KV
  feature flags, org settings cache, versioned keys, short TTL
```

Shard keys: organization (horizontal) and time (longitudinal archive to R2).

ORM: Drizzle with `durable-sqlite` and `d1` drivers, one schema language.

## Why not the alternatives

- Single D1: 10 GB ceiling, serial queries, isolation by `WHERE` discipline only, `batch()` only.
- PlanetScale: unbounded but a network hop per query, $40+/mo floor, ops surface, and it solves
  a hundreds-of-GB problem we do not have.
- OrgDO wins on: isolation by construction (wrong org = different object), real synchronous
  transactions, compute co-located with data, $0.20/GB-mo storage, PITR 30 days, zero ops.

## Consequences

- No ad-hoc SQL across organizations. Platform dashboards read rollups that OrgDO pushes to D1
  and Workers Analytics Engine.
- Schema migrations run inside the DO on wake: versioned, idempotent, tested. `schema_version`
  table per DO.
- No DO enumeration API: the D1 org directory is the index. Keep it in sync via outbox.
- One org = one single-threaded object. Live/chat traffic goes to TripLiveDO, not OrgDO.
- Users abroad reach the home-region DO (~100–200 ms). Mobile is offline-first; acceptable.
- Export/backup per org is a job to R2; build early, it is also the archive feature.
- DO count is not a concern: objects are created on first access, hibernate idle, cost storage
  only when idle. `deleteAll()` on TripLiveDO after trip end + grace.
