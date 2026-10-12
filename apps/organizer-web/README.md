# @voysemble/organizer-web

Organizer PC console. React 19 + Vite + TanStack Router (code-based routes) + TanStack Query.
Served by `apps/api-worker` through Workers Static Assets on the same origin as `/v1/*`
(ADR-0008), so the browser needs no CORS and cookies stay host-only.

Slice 003 ships the shell (sidebar, top bar with org/trip context) and the Command Center on a
deterministic fixture (`src/fixtures/korea-concert-tour.ts`, "now" frozen at Day 4). Every
other section is an honest placeholder.

Slice 004 adds the Itinerary editor at `/itinerary?day=YYYY-MM-DD`: day rail, per-day timeline
with keyboard reorder, detail form, draft tracking and a local publish that bumps the revision.
Drafts stay in the browser until the API slice.

States: `/?state=live|loading|empty|error|offline`, `/itinerary?state=loading|empty|error`.

```sh
pnpm --filter @voysemble/organizer-web dev        # http://localhost:5173
pnpm --filter @voysemble/organizer-web test       # vitest + happy-dom component tests
pnpm --filter @voysemble/organizer-web build      # dist/ consumed by the Worker
pnpm --filter @voysemble/organizer-web test:e2e   # Playwright: facts + screenshots -> docs/captures/web/
```

The browser suite runs against `dist/` through `wrangler dev` (the api-worker's `pretest` hook
builds it, the console's own `test` does not): build again after a console change, or the
specs test the previous build.

No icon library, no CSS framework, no fonts from third parties, no analytics. Strings live in
`src/lib/strings.ts` (EN source; KO in the i18n slice). Cover art is synthetic until licensed
photography is approved (doc 01 §15).
