# Meeting windows (slice 029, D15)

No ambient tracking. A leader (or the organizer on the console) opens a window: a label, a place,
a time range, a radius around a meeting point, and the groups it concerns. Each traveler opts in
per window on the phone. The phone compares its own fix with the meeting point and sends only the
judged state: inside, outside or uncertain. The service holds the states and the meeting point
while the window is open, never a person's coordinates, and forgets the point at close. Guardians
never see windows (D13). Exercised by `apps/api-worker/test/windows.test.ts`,
`mobile/core/.../window/WindowRulesTest.kt`, `mobile/android-app/.../window/MeetingWindowViewModelTest.kt`,
`mobile/ios-app/VoysembleTests/LiveModelsTests.swift` and `CoreModelsTests.swift`, the Safety cases in
`sections.test.tsx`, `apps/organizer-web/src/lib/window-schematic.test.ts` and
`apps/organizer-web/e2e/safety-windows.spec.ts`.

## Storage (OrgDurableObject, schema version 11)

| Table | Columns | Notes |
|---|---|---|
| `meeting_windows` | id (PK), trip_id, label, place, radius_meters, starts_at, ends_at, groups_json, opened_by_participation_id, opened_by_name, opened_at, closed_at, center_lat, center_lng | One row per window. `center_lat`/`center_lng` are the meeting point, set at open and **nulled at close** (explicit close or the lazy auto-stop at `ends_at`). Tier 1 (operational): a place the leader chose, never a person's position. |
| `meeting_window_members` | window_id + participation_id (PK), state, reported_at | One row per traveler of the window's groups (every traveler when the list is empty), created `opted_out` at open. `state` is what the device last reported; `reported_at` is the server's receipt time. |

Nothing else is stored: no fixes, no history of states, no distance. `stale` is never written; it is
derived on read when a report is older than `WINDOW_STALE_MS` (3 minutes) while the window is open.

## Rules shared by the server, the phones and the console

| Rule | Where | Behaviour |
|---|---|---|
| Window status | `windowStatusOf` (contracts), `MeetingWindowDto.status` on the phones | `closed` when `closedAt` is set or `now >= endsAt`; `scheduled` before `startsAt`; `open` otherwise. The server auto-stops lazily: any read or write at or after `ends_at` closes the row and nulls the point first. |
| Device judgement | `windowStateOf` (contracts), `judgeWindowState` (core) | `inside` when distance + accuracy ≤ radius; `outside` when distance − accuracy > radius; `uncertain` in between, without a fix, or without permission. The only place a coordinate is ever compared is the device. |
| Stale | `windowFromRow` (OrgDO) | A report older than 3 minutes while open reads as `stale`; the device re-judges and re-sends every 60 seconds while the switch is on, so a sharing phone never reads as stale. |
| Visibility | `routes/windows.ts` | Staff (owner, organizer, a participating leader) see every member; a traveler sees only their own row; a guardian gets 403 on every window route. The meeting point is returned only while the window is open and only to staff and members. |
| Schematic spots | `schematicOffset` (core and `lib/window-schematic.ts`) | A deterministic offset per state and member index inside a unit disc: inside within 0.75 r, uncertain and stale on the rim, outside beyond it. Never a position; the same constants on both sides so the console and the apps draw the same picture. |

## Routes

| Route | Who | Behaviour |
|---|---|---|
| `GET .../windows` | members and staff | `WindowList`, newest first, at most 20, auto-stopped before reading. |
| `POST .../windows` | staff | `OpenWindowRequest` (`label`, `place`, `radiusMeters` 25..2000, `startsAt`, `endsAt`, `groups` default `[]`, `center`). 400 when the window ends before it starts or is already over. 201 with the window; members are the travelers of the groups, all `opted_out`. |
| `POST .../windows/{windowId}/close` | staff | Sets `closedAt`, nulls the point. Idempotent. |
| `PUT .../windows/{windowId}/me` | the member | `{ state }` with `opted_out`, `inside`, `outside` or `uncertain`. 403 when the caller is not a member of this window; 409 when the window is closed (or auto-stopped). Answers `{ state, reportedAt, windowStatus }`. |

## Console (Safety page)

With an organization and a trip the window card is live: the current window (open, else scheduled)
with the schematic map, the counts, the member list with each state and the time of the last report,
a "Live" chip and "Close window". Without a current window the card holds the open form (label,
place, radius, start, end, groups, meeting point) and the recent closed windows are listed under
"Earlier windows". The list is polled every 30 seconds while the page is open. Without a trip the
fixture card shows with its "Sample data" chip. Evidence: `web/<project>/safety-window-live.png`.

The organizer can open a window from the console too; the console form takes the meeting point as
numbers because there are no map tiles (D15). Leaders open windows from the phone (slice 032, below).

## Phones

Both apps show the same screen as before, now live when signed in on a trip (sample mode keeps the
fixture): the current window from the API, the schematic map from the states, the traveler's switch.

- Switch on: ask for location permission once (when-in-use on iOS; fine or coarse on Android),
  take one fix, judge it in core against the window's point, send the state. No permission or no
  fix sends `uncertain`. Every 60 seconds while on: re-judge, re-send, refresh the window.
- Switch off: send `opted_out` and stop reading fixes.
- No window open or scheduled: "No meeting window is open right now." with the live chip.
- A closed window (409) shows "This window has ended."; an unreachable server says offline.
- Leader (slice 032): without a window the screen offers "Open a window here": label, place, radius
  (200 m), duration (30 min), groups (prefilled with the leader's own group from the roster; empty
  means every traveler). The phone's fix is the meeting point, read once when the leader presses
  the button (the leader stands where the group should gather); without a fix nothing is sent and
  the screen says so. While a window is open the leader has "Close window now". Evidence:
  `android/window-open-form.png`, `ios/window-open-form.png`.

| Piece | Android | iOS |
|---|---|---|
| Location port | `LocationSource` (core, `fun interface`) implemented by `AndroidLocationSource` (`LocationManager.getCurrentLocation`, 15 s timeout, `getLastKnownLocation` below API 30) | `DeviceLocationSource` (a Swift protocol over core's `LocationFix`) implemented by `CoreLocationSource` (`requestLocation`, when-in-use) |
| Permission | `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION` in the manifest; runtime request from the screen when the switch turns on | `NSLocationWhenInUseUsageDescription` in `project.yml`; CoreLocation prompts on the first fix |
| Model | `MeetingWindowViewModel(api, trip, locationSource, deviceClock, tickMs)` | `MeetingWindowModel(api:trip:locationSource:)` with `run()` driven by the view's `.task` |
| Core helpers | `judgeWindowStateFor(fix, window)`, `currentWindowOf(windows)`, `selfStateOf`, `withSelfState`, `wireNameOf`, `MeetingWindowDto.toMeetingWindow(selfId, clock)` | same, through `WindowRulesKt` for the top-level ones |

Why a Swift protocol rather than core's `LocationSource`: a Kotlin `fun interface` with a suspend
function exports to Swift as a completion-handler protocol, which is awkward to implement in Swift;
the protocol takes core's `LocationFix` and the judgement still happens in core
(`judgeWindowStateFor`), so the rule is not duplicated. Both apps never background: the fix is
read only while the screen is on and the switch is on.

## Facts established by tests

- A leader opens a window for Bus A; Minji and Juho are members (`opted_out`), Hana (Bus B) is not and her report is 403; a guardian is 403.
- A traveler's view carries the meeting point and only her row; staff see every row and the counts.
- Inside and opted-out reports change the row; after close the point is null and a report is 409; a window ending within a second auto-stops; a window that starts later is `scheduled`.
- The device rule: 50 m ± 20 within 200 m is inside, 250 m ± 20 is outside, 190 m ± 20 is uncertain, no fix is uncertain (JVM, Swift and the worker agree).
- Android: switching on with a nearby fake fix posts exactly `{"state":"inside"}` and no coordinate; no fix posts `uncertain`; switching off posts `opted_out`; 409 says the window has ended; an empty list shows no window; unreachable says offline; sample mode never posts.
- iOS: a live model starts empty and says offline when unreachable; sample mode flips the fixture; the Swift calls into core compile and agree with the JVM facts.
- Console: the live card shows the counts and the member states, draws one spot per sharing member, closes the window; the form posts the meeting point once with a 45-minute default range; the browser test opens a window, has Minji report `inside` through the API, sees 1 inside and 1 opted out, closes it, and the next report is 409.

## Not done

A window per itinerary event (one tap from "Meeting point" on Today); push to travelers when a
window opens. Done since: Korean strings on the phones (slice 039).
