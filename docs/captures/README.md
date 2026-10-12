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

PNG captures are never staged from a workstation or the authoring sandbox (`git add -A -- . ':!docs/captures/**/*.png'`):
CI's PNGs are canonical and local runs only preview them, which keeps the branch free of binary
conflicts. Since slice 022 (D31) the CI `captures` job commits every job's PNGs back to the branch as
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

## Slice 026 (2026-10-12): person card on People

`web/desktop-1440/people-person.png`, `web/laptop-1280/people-person.png`: Sora's card beside the live
roster (guardian link, placeholders, empty timeline). Produced by `e2e/people.spec.ts`.

## Slice 027 (2026-10-12): live fee ledger

`web/desktop-1440/billing-live.png`, `web/laptop-1280/billing-live.png`: the ledger after a fee was set,
one payment saved and a bank CSV imported (1 paid, 1 partial, 1 unpaid). Produced by `e2e/billing.spec.ts`.
`android/today-guardian.png` and `ios/today-guardian.png` now carry the balance line.

## Slice 028 (2026-10-12): roster actions on the person card

`web/desktop-1440/people-actions.png`, `web/laptop-1280/people-actions.png`: Juho's card after a regroup
and a revoked code ("Code not issued" in the row). Produced by `e2e/people.spec.ts`.

## Slice 029 (2026-10-12): live meeting windows

`web/desktop-1440/safety-window-live.png`, `web/laptop-1280/safety-window-live.png`: the live window card
after Minji reported "inside" from the API (1 inside, 1 opted out, the member list, "Live" and "Open" chips,
"Close window"). Produced by `e2e/safety-windows.spec.ts`. `android/window-none.png` (Roborazzi) and
`ios/window-sharing-dark.png`, `ios/window-none.png` (CaptureTests): the switch on in dark mode and the
"No window open" state. Both land here through the CI `captures` job.

## Slice 030 (2026-10-12): care notes

`web/desktop-1440/people-care.png`, `web/laptop-1280/people-care.png`: Minji's card after a save and an
audited reveal (status line with the reveal count, the three fields, the timeline entry) and the roster
row's revealed line. Produced by `e2e/people.spec.ts`. `android/headcount-care.png` (Roborazzi) and
`ios/headcount-care.png` (CaptureTests): the head count roster row with the care icon and the revealed
line under Minji's name. Both land here through the CI `captures` job.

## Slice 031 (2026-10-12): device revocation

`web/desktop-1440/people-revoke.png`, `web/laptop-1280/people-revoke.png`: Minji's card after "Revoke
devices" (status with the new code, the row back to Invited, the timeline fact). Produced by
`e2e/revoke.spec.ts`. `android/sign-in-revoked.png` (Roborazzi) and `ios/sign-in-revoked.png`
(CaptureTests): the sign-in screen with the revocation notice. Both land here through the CI `captures` job.

## Slice 032 (2026-10-12): leader opens a window, guardian writes the care note

`android/window-open-form.png` (Roborazzi) and `ios/window-open-form.png` (CaptureTests): the leader's
"Open a window here" form on a trip without a window (group prefilled). `android/today-guardian-care.png`
and `ios/today-guardian-care.png`: the guardian's care-note card in edit mode under the status card. All
land here through the CI `captures` job.

## Slice 033 (2026-10-12): chat channels

`web/desktop-1440/communication-chat.png`, `web/laptop-1280/communication-chat.png`: the guardian's
thread on Communication after the organizer's reply. Produced by `e2e/chat.spec.ts`. `android/chats-list.png`,
`android/chats-thread-dark.png` (Roborazzi) and `ios/chats-list.png`, `ios/chats-thread-dark.png`
(CaptureTests): the channel list with badges and Minji's thread with a pending message. All land here
through the CI `captures` job.

## Slice 034 (2026-10-12): live report and missing list

`web/desktop-1440/reports-live.png`, `web/laptop-1280/reports-live.png`: the live Reports page after one
closed head count and one announcement (tiles, the day charts). `web/desktop-1440/safety-missing-live.png`,
`web/laptop-1280/safety-missing-live.png`: Safety with Juho missing from Bus A's latest closed count.
Produced by `e2e/reports.spec.ts`.

## Slice 035 (2026-10-12): the Plan tab and proposals from both phones

`android/plan-day.png` (Roborazzi) and `ios/plan-day.png` (CaptureTests): the Plan tab on the
fixture's concert day with the day chips and the leader's "Propose a change" and "Propose an event". `android/plan-propose-dark.png` and `ios/plan-propose-dark.png`: the proposal form
for a new event, filled as a leader would. All land here through the CI `captures` job.

## Slice 036 (2026-10-12): live Settings

`web/desktop-1440/settings-live.png`, `web/laptop-1280/settings-live.png`: Settings on the API after
the owner renamed the organization, moved the quiet hours and the wrap-up window ("Saved." on each
card) with the members card showing the owner as you. Produced by `e2e/settings.spec.ts`. The earlier `settings.png` (the sample page) is no longer produced: a signed-in account always has the live page.

## Slice 037 (2026-10-12): Liquid Glass on iOS

Every `ios/*.png` from this slice on is rendered on the iOS 26 simulator (CI on `macos-26`, Xcode 26)
with the glass control layer of D32: chips, the Plan day picker, the up-next card's buttons and the
tab bar. The pictures before this slice came from Xcode 16.4 on `macos-15` with the flat fallback.

## Slice 038 (2026-10-12): Korean console

`web/desktop-1440/command-center-ko.png`, `web/laptop-1280/command-center-ko.png`,
`web/desktop-1440/people-ko.png`, `web/laptop-1280/people-ko.png`: the command center and People after
the top-bar toggle switched the console to Korean. Produced by `e2e/locale.spec.ts`.
