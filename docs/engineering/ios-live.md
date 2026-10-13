# iOS on the API (slice 024)

The SwiftUI app reads and writes the same API as Android for the active trip: Today from the
published itinerary with the required-ack announcement on the card, Bulletin through the core
sync (outbox replay, fetch, merge), the leader's head count from the roster with one push per
close, and the incident feed with local-first answers. Sample mode (no account) keeps the fixture.
The rules live in `mobile/core`; the Swift models are wiring, and every rule they rely on is
proven once by the JVM tests. Exercised by `mobile/core/.../today/TodayLiveTest.kt`,
`HeadcountsSyncTest.adoptPush_*`, `IncidentsSyncTest.confirmRequestOf_*`, and
`mobile/ios-app/VoysembleTests/LiveModelsTests.swift` on the CI simulator.

## Shared rules moved into core

| Function | File | Used by |
|---|---|---|
| `latestRequiredAck(announcements)` | `core/.../today/TodayLive.kt` | The oldest unacknowledged required-ack announcement rides on Today; the latest one once everything is acknowledged; none otherwise. Android `TodayViewModel` and iOS `TodayModel`. |
| `AnnouncementDto.toTodayAnnouncement(clock)` | same | The wire announcement as the Today card. |
| `TodaySnapshot.withAnnouncement`, `.withOffline`, `emptyTodaySnapshot(tripName)` | same | Named copies and the honest empty snapshot so Swift never spells every field of the data class. |
| `HeadcountSession.adoptPush(result)` | `core/.../api/Headcounts.kt` | Marks made while a push was in flight win; only the sync flag is taken from the result. Android `HeadcountViewModel` and iOS `HeadcountModel`. |
| `confirmRequestOf(confirmation)` | `core/.../api/Incidents.kt` | The pending incident answer as the wire body (Swift cannot call an extension on a bridged Kotlin enum). |

## Swift models

| Model | Live behaviour | Sample mode |
|---|---|---|
| `TodayModel(api:trip:)` | Starts with `emptyTodaySnapshot(trip.tripName)` and `.task { refresh() }` on the tab view: `getItinerary` → `todaySnapshotOf(device date and clock in the trip's zone)`, then `listAnnouncements` → `latestRequiredAck` on the card. "Got it" acknowledges locally, posts the ack, and confirms on Ok. A failed answer shows a safe message; no answer marks the snapshot offline. Header chip "Live" / "Syncing". | Fixture, "Sample data" chip, no network. |
| `BulletinModel(api:trip:)` | Empty feed, `.task` and pull-to-refresh call `syncBulletin` (outbox replay, fetch, merge). "Got it" is local first (pending + outbox) then one sync. Status "Live" / "Syncing" / "Offline"; "No announcements yet." when empty. | Fixture. |
| `HeadcountModel(api:trip:)` | `loading` until `.task` loads the roster: the leader's own group (whole trip without one) via `headcountFromRoster`, then an open-session push. Close is local first then one push; "Retry sync" pushes again; `adoptPush` keeps in-flight marks. 403 and offline read as safe messages. | Fixture with the fixed clock "06:58" for captures. |
| `IncidentsModel(api:trip:)` | `.task` and pull-to-refresh replay pending answers then `listIncidents` → `mergeIncidents` (device locale for the guardian text). An answer is recorded locally ("Me") and sent once; a refused send shows a message, no answer marks offline. | Fixture with the fixed clock "07:12". |

`TodayView` owns the four models as `@StateObject`s created from the Today model's client and
trip, so the tab and the leader screens share one session. `RootView` passes `session.api` and
the ready session's `ActiveTrip`; sample mode passes nothing. `Clocks` holds the device date and
time in a zone and the ISO → local HH:mm formatter used for publish and confirmation times.

## Facts established by tests

- Core: see the functions above (`TodayLiveTest`: selection order, card mapping, helpers;
  `adoptPush`: in-flight marks win, rejections never flip the flag; `confirmRequestOf`: wire body).
- iOS (`LiveModelsTests`, against a client whose port is closed): a live Today starts with the
  trip name and no events, and goes offline without an error when unreachable; sample mode keeps
  day 4 and never syncs, and "Got it" queues locally; a live Bulletin and a live Incidents feed
  mark offline; a live head count starts loading and fails safely with the offline message;
  `Clocks` formats wire times and leaves garbage untouched.
- Captures (`CaptureTests`): unchanged fixture states; live states on the simulator need a mock
  server and are not captured yet.

## Rules learned (SKIE)

- Read a result's payload as `(r as? ApiResultOk<T>)?.value`: optional chaining works whether the
  generic `value` imports as optional or not.
- Do not call a Kotlin extension function on a bridged enum from Swift; give core a top-level
  function that takes the enum (or the object holding it) instead.
- Kotlin `Int?` parameters take `KotlinInt(int:)`.
- Prefer named-copy helpers in core over `doCopy(...)`, which needs every field.

## Not done

Captures of the live (signed-in) screens on the simulator (the captures render the fixtures);
Apple sign-in (deferred). Done since: proposing an itinerary change from iOS
(`plan-propose-dark.png`); the meeting window on the API on both platforms (`meeting-windows.md`).
