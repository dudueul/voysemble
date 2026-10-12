# Captures

Screenshots produced by automated browser/device runs of the implemented clients. They are
evidence for the visual-acceptance gate (doc 01 §18.4, §24.4), compared by a reviewer against
`docs/visual-references/`. Never hand-edited, never upscaled collages.

| Path | Produced by | Viewport |
|---|---|---|
| `web/desktop-1440/*.png` | `pnpm --filter @voysemble/organizer-web test:e2e` | 1440x960 |
| `web/laptop-1280/*.png` | same | 1280x800 |
| `web/tablet-1024/*.png`, `web/phone-390/*.png` | same (responsive spec) | 1024x768, 390x844 |
| `public/<project>/*.png` | `pnpm --filter @voysemble/public-web test:e2e` | the same four viewports |
| `android/*.png` | CI `mobile` job (Roborazzi) | 412x915 |
| `ios/*.png` | CI `ios` job (`CaptureTests.swift`, UIWindow + `drawHierarchy`) | 393x852 at 2x |

Since slice 022 (D31) the CI `captures` job commits every job's PNGs back to the branch as
`chore(captures): record device captures for <sha> [skip ci]`, so this folder is the current state of
every client after each green push to `next`. Android and iOS captures therefore appear here one CI run
after the slice that added them.

## Slice 007 (2026-10-11): sign-in and setup checklist on the real API

`web/<project>/sign-in.png`, `web/<project>/setup-1-org.png` … `setup-4-invites.png`. Produced by
`e2e/setup.spec.ts` against `wrangler dev` (local D1, Durable Objects, fixture mailbox). Codes in
`setup-4-invites.png` are random per run.

## Slice 008 (2026-10-11): all menus, four viewports

`web/desktop-1440/` and `web/laptop-1280/`: `people`, `communication`, `safety`, `journey-graph`,
`travel`, `media`, `preparation`, `reports`, `billing`, `settings` (fixtures, "Sample data" chip).
`web/tablet-1024/` and `web/phone-390/`: `command-center`, `itinerary`, `people`, `safety`,
`reports`, `setup`; `phone-390/nav-drawer.png` shows the open drawer.

## Slice 009 (2026-10-11): Android head count, bulletin, meeting window

`android/headcount-open.png`, `headcount-closed-dark.png`, `bulletin-light.png`,
`bulletin-offline-queued.png`, `window-open.png`, `window-sharing-dark.png`. Recorded by the CI
`mobile` job (Robolectric + Roborazzi, 412x915) into the `android-captures` artifact; copy them
here from the run page (the authoring sandbox cannot reach GitHub's artifact storage).

## Slice 010 (2026-10-11): announcements on the real API

`web/desktop-1440/communication-live.png`: Communication page after publishing from the console
against `wrangler dev`, with the ack meter and unacked names from the API.

## Slice 011 (2026-10-11): Android sign-in and invite

`android/sign-in.png`, `android/sign-in-awaiting-dark.png`, `android/invite.png` from the CI
`mobile` job (`android-captures` artifact).

## Slice 021 (2026-10-12): public site, four viewports

`public/desktop-1440/`, `public/laptop-1280/`, `public/tablet-1024/`, `public/phone-390/`:
`landing-en-top.png`, `landing-ko-top.png`, `privacy-en-top.png` (the first viewport at each size);
`public/desktop-1440/landing-en.png` and `landing-ko.png` are the full pages (one record each, since
a full page is megabytes). Produced by `apps/public-web/e2e/landing.spec.ts` against the
assets-only Worker under `wrangler dev`.
D31: from this slice on, every client slice records captures per device class.

## Slice 022 (2026-10-12): capture pipeline, iOS captures

`ios/today-light.png`, `today-dark.png`, `headcount-open.png`, `headcount-closed-dark.png`,
`bulletin-light.png`, `incidents-light.png`, `window-open.png`, `sign-in.png`, `invite.png` from
`mobile/ios-app/VoysembleTests/CaptureTests.swift` on the CI simulator; `android/*.png` from the
Roborazzi tests. Both land here through the `captures` job.

## Slice 023 (2026-10-12): People page on the API

`web/desktop-1440/people-live.png`, `web/laptop-1280/people-live.png`: the live roster after invite
codes were issued (five "Invited" rows, guardian bindings, group chips). Produced by `e2e/people.spec.ts`.

## Slice 025 (2026-10-12): guardian status on Today

`android/today-guardian.png` (Roborazzi) and `ios/today-guardian.png` (CaptureTests): the guardian's
card ("Counted present · Bus A · 06:52 · by Kim Daeun") in place of the head count card and the leader
links. Both land here through the CI `captures` job.
