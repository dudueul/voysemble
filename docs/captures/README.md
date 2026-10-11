# Captures

Screenshots produced by automated browser/device runs of the implemented clients. They are
evidence for the visual-acceptance gate (doc 01 §18.4, §24.4), compared by a reviewer against
`docs/visual-references/`. Never hand-edited, never upscaled collages.

| Path | Produced by | Viewport |
|---|---|---|
| `web/desktop-1440/*.png` | `pnpm --filter @voysemble/organizer-web test:e2e` | 1440x960 |
| `web/laptop-1280/*.png` | same | 1280x800 |

Mobile captures (390x844 iOS, 412x915 Android) arrive with the P1 mobile slices.

## Slice 007 (2026-10-11): sign-in and setup checklist on the real API

`web/<project>/sign-in.png`, `web/<project>/setup-1-org.png` … `setup-4-invites.png`. Produced by
`e2e/setup.spec.ts` against `wrangler dev` (local D1, Durable Objects, fixture mailbox). Codes in
`setup-4-invites.png` are random per run.

## Slice 008 (2026-10-11): all menus, four viewports

`web/desktop-1440/` and `web/laptop-1280/`: `people`, `communication`, `safety`, `journey-graph`,
`travel`, `media`, `preparation`, `reports`, `billing`, `settings` (fixtures, "Sample data" chip).
`web/tablet-1024/` and `web/phone-390/`: `command-center`, `itinerary`, `people`, `safety`,
`reports`, `setup`; `phone-390/nav-drawer.png` shows the open drawer.
