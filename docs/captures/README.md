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

## Slice 039 (2026-10-12): Korean on the phones

`android/today-ko.png`, `android/plan-day-ko.png` (Roborazzi) and `ios/today-ko.png`, `ios/plan-day-ko.png`
(CaptureTests): Today and the Plan tab with the app's language set to Korean; the sample trip's own
names stay as they are. All land here through the CI `captures` job.

## Slice 040 (2026-10-12): the public site shows the phones

`public/desktop-1440/landing-en.png`, `landing-ko.png` and the `*-top.png` first viewports re-render with the
phone gallery (six real captures from `ios/` and `android/` in device frames) and the new feature cards.
Produced by `apps/public-web/e2e/landing.spec.ts`.

## Slice 042 (2026-10-12): organizer invitations

`web/desktop-1440/settings-invitations.png`, `web/laptop-1280/settings-invitations.png`: the owner's
Settings after inviting an organizer who joined (members card: owner and organizer; invitations:
one accepted, one revoked). `web/desktop-1440/invitation-accepted.png`, `web/laptop-1280/
invitation-accepted.png`: the invitee's landing card after signing in through the emailed link.
Produced by `apps/organizer-web/e2e/invitations.spec.ts`. No phone change (D21: organizers use the
console).

## Slice 043 (2026-10-12): photos on the console

`web/desktop-1440/media-live.png`, `web/laptop-1280/media-live.png`: the live Media page after two
uploads from the console (one flagged by the fixture moderation and approved, one tagged with Minji
for the guardian album): the pool with browser-made thumbnails, the empty review queue, the album
counts and list. Produced by `apps/organizer-web/e2e/media.spec.ts`. Phones follow in slice 044.

## Slice 044 (2026-10-12): the Memories tab

`android/memories-light.png`, `android/memories-guardian-dark.png` (Roborazzi) and `ios/memories-light.png`,
`ios/memories-guardian-dark.png` (CaptureTests): the leader's view of the sample pool (review queue,
grid with album chips, "Add photos") and a guardian's album-only view. Produced by
`MemoriesScreenshotTest` and `CaptureTests.testMemories`.

## Slice 045 (2026-10-12): documents and forms

`web/desktop-1440/preparation-live.png`, `web/laptop-1280/preparation-live.png`: the live Preparation
page with one requirement opened (Minji collected, Juho's PNG scan revealed under the watermark after
the step-up confirmation, Hana missing) and the add form. Produced by
`apps/organizer-web/e2e/preparation.spec.ts`. No phone change (D27: never on a phone).

## Slice 046 (2026-10-12): travel bookings

`web/desktop-1440/travel-live.png`, `web/laptop-1280/travel-live.png`: the live Travel page with a
delayed flight, a hotel and a bus whose seats come from the roster groups it names, each card with
its add form. Produced by `apps/organizer-web/e2e/travel.spec.ts`. Phones follow in slice 047.

## Slice 047 (2026-10-12): bookings on the leader's phone

`android/plan-day.png`, `ios/plan-day.png` (updated): the concert day now ends with its bookings
(the hotel's night 4 of 5, the two buses with their roster seats). `android/plan-arrival.png`,
`ios/plan-arrival.png` (new): the arrival day with the flight from ICN and the hotel check-in.
Produced by `PlanScreenshotTest.plan_day_light` and `CaptureTests.testPlan`.

## Slice 048 (2026-10-12): the packing checklist

`web/desktop-1440/preparation-packing.png`, `web/laptop-1280/preparation-packing.png`: the live
Preparation page with the packing card (two items, Minji's tick counted, the "By traveler" fold
open). Produced by `apps/organizer-web/e2e/preparation.spec.ts`. `android/packing-light.png`,
`android/packing-guardian-dark.png` (Roborazzi) and `ios/packing-light.png`,
`ios/packing-guardian-dark.png` (CaptureTests): a traveler's list with six of nine packed and a
guardian's list for their traveler. `android/today-guardian.png` (updated) carries the packing
card. Produced by `PackingScreenshotTest` and `CaptureTests.testPacking`.

## Slice 049 (2026-10-12): the driver's sealed link

`web/desktop-1440/driver-sheet.png`, `web/laptop-1280/driver-sheet.png`: the public bus sheet a
driver opens from the link (names only, printable). `web/<project>/travel-live.png` (updated): the
bus row with the minted link, its URL shown once, and the link list with its opens. Produced by
`apps/organizer-web/e2e/travel.spec.ts`. No phone change.

## Slice 050 (2026-10-12): the live journey graph and movements

`web/desktop-1440/journey-graph-live.png`, `web/laptop-1280/journey-graph-live.png`: the Journey
Graph page on a trip day with three itinerary events, the ten-minute gap flagged at risk, the day
chips, the tight-connections and proposals cards. `web/<project>/command-center-movements.png`:
the command center with the same events in its next 48 hours. Produced by
`apps/organizer-web/e2e/journey-graph.spec.ts`. No phone change.

`android/incidents-new.png`, `ios/incidents-new.png` (slice 073): the form a leader fills to open a card by
hand, Bus A's travelers as checkboxes. `web/<project>/safety-manual-incident.png` (slice 068): the Safety page after the organizer opened a
card by hand, leading the list. `android/today-trip-switch.png`, `ios/today-trip-switch.png` (slice 067): the account's trips as the
switch lists them, the current one marked. `web/<project>/communication-chat-removed.png` (slice 065): the organizer's guardian thread after
removing Sora's message, the tombstone in its place. `web/<project>/safety-audited-read.png` (slice 064): the open incident card with Bus A's channel read
under its note. `web/<project>/command-center-trips.png` (slice 063): the Today page with three trips, the one
just created from the Trips panel active in the top bar's select. `command-center-offline-first.png`:
the offline state of a first load without a connection to the organizations, with Retry.

## Slice 051 (2026-10-12): the disruption card

`web/desktop-1440/journey-graph-disruption.png`, `web/laptop-1280/journey-graph-disruption.png`:
the Journey Graph page after Breakfast slipped twenty minutes and the moves were applied to the
draft (the bus node at 10:20, the propagation list, the status line). Produced by
`apps/organizer-web/e2e/journey-graph.spec.ts`. No phone change.

## Slice 052 (2026-10-12): the notification log

`web/desktop-1440/notifications-log.png`, `web/laptop-1280/notifications-log.png`: the log the
bell leads to, with a shared required-ack announcement (three travelers in priority, two guardians
in normal) and a plain one (three travelers in normal). Produced by
`apps/organizer-web/e2e/notifications.spec.ts`. No phone change.

## Slice 053 (2026-10-12): the phones' inbox

`android/inbox-light.png` (Roborazzi) and `ios/inbox-light.png` (CaptureTests): a leader's inbox
on the concert morning, two unread (the head-count call in the priority lane, the concert
announcement in the normal lane), the plan update, the accepted proposal and the incident
confirmation read. `android/inbox-all-read-dark.png`, `ios/inbox-all-read-dark.png`: the same
inbox all read, dark. `android/today-light.png` and `ios/today-light.png` (updated): the header's
bell carries the badge "2". No console change.

## Slice 054 (2026-10-12): the guardian digest email

`web/desktop-1440/notifications-log.png`, `web/laptop-1280/notifications-log.png` (updated): the
log's digest column now carries the emailed count when the digest run mailed rows, and the line
under the table says where the digest hour is set. Produced by
`apps/organizer-web/e2e/notifications.spec.ts`. No phone change.

## Slice 055 (2026-10-12): the AI drafts for a disruption

`web/desktop-1440/journey-graph-drafts.png`, `web/laptop-1280/journey-graph-drafts.png`: the
Journey Graph page after Breakfast slipped twenty minutes and the organizer asked for drafts: the
three from the fixture port (absorb the slip; shorten Lunch to end 13:10; cut Lunch), each with
its rationale and steps and the apply button. Produced by
`apps/organizer-web/e2e/journey-graph.spec.ts`. No phone change.

## Slice 057 (2026-10-12): the revision history

`web/desktop-1440/itinerary-history.png`, `web/laptop-1280/itinerary-history.png`: the history
page after two publishes of the sample trip: revision 2 with its change line ("Day 1 · Group
check-in · 09:00 → 08:30"), revision 1 as the first publish with its snapshot unfolded. Produced
by `apps/organizer-web/e2e/itinerary.spec.ts`. No phone change.

## Slice 058 (2026-10-12): rooming lists and the hotel's sealed link

`web/desktop-1440/travel-rooming.png`, `web/laptop-1280/travel-rooming.png`: the Travel page with
the hotel's rooming list unfolded, Minji and Juho in room 204, the summary line. `web/<project>/
hotel-sheet.png`: the hotel's sheet opened through the sealed link in a second browser context,
the stay, room 204 with its two names, the unassigned, the leader by name. Produced by
`apps/organizer-web/e2e/travel.spec.ts`. No phone change.

## Slice 059 (2026-10-12): the rooming list on the leader's phone

`android/rooming-light.png`, `android/rooming-dark.png` (Roborazzi) and `ios/rooming-light.png`,
`ios/rooming-dark.png` (CaptureTests): the fixture hotel's rooms (412, 415, the leader's 501),
the leader in bold, Lee Hana without a room yet, the summary line. No console change.

## Slice 061 (2026-10-12): the inbox row opens its target

`android/inbox-light.png` and `ios/inbox-light.png` (updated): each row that leads somewhere now
carries "Open" beside "Mark read" (the head-count call, the announcement, the plan update, the
proposal and the incident rows of a leader's inbox). No console change.
