# Voysemble

Group travel operations: organizers plan, travelers and guardians stay informed, leaders run
headcounts and meeting points. Single-operator platform, organization-scoped data.

- Decisions: `docs/decisions/` (ADRs) and `docs/planning/decision-log.md`
- Reference specs: `docs/references/`; visual references: `docs/visual-references/`
- Work graph: `planning/prototype-work-graph.json`; status: `feature-status.json`
- Engineering rules: `docs/engineering/`

Stack (ADR-0002, 0003, 0004): Cloudflare Workers + Hono + zod-openapi; global D1 + per-org
SQLite Durable Objects + per-trip live DO + R2; React web console; Kotlin Multiplatform core
with SwiftUI and Jetpack Compose apps.

```sh
pnpm install
pnpm check          # lint, typecheck, test, header lint
pnpm --filter @voysemble/api-worker dev
cd mobile && ./gradlew :core:jvmTest -Pvoysemble.android=false   # KMP core tests on any host
```

Mobile workspace: `mobile/README.md`.

Branch `next` is the integration branch while scaffolding.
