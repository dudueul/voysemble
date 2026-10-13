# Head counts on the API and the live Android screen (slice 012)

Implements D14 (offline head count, idempotent sync) and the record-keeping half of D25 (close
with named missing) on the API and the KMP core, and wires the Android head count screen to the
real trip. Exercised by `apps/api-worker/test/headcounts.test.ts`,
`mobile/core/.../api/HeadcountsSyncTest.kt`, and
`mobile/android-app/.../headcount/HeadcountViewModelTest.kt`.

## Principle

The leader's device owns the session. It mints the id, seeds the roster, marks, and closes; the
server only ever receives the whole session in one idempotent `PUT` keyed by that id. Replaying
the same upsert is a no-op, a session the server already holds closed is never reopened, and
nothing on the device waits for the network: "Pending sync" is a chip, not a blocker.

## Storage (OrgDurableObject, schema version 3)

| Table | Columns | Notes |
|---|---|---|
| `headcounts` | id, trip_id, group_name, opened_by_participation_id, opened_by_name, opened_at_device, closed_at_device, received_at | `id` is the client-minted UUID. `group_name` null = whole trip. Device times are stored verbatim (audit trail), `received_at` is server time. |
| `headcount_marks` | headcount_id, participation_id, mark | Primary key (headcount, participation). Replaced wholesale on every accepted sync. |

Scope of a session is the trip's travelers of `group_name` (or all travelers). Leaders and
guardians are never counted. A traveler in scope with no mark row counts as missing; marks for
participation ids outside the trip are dropped silently.

## Routes

| Route | Who | Behaviour |
|---|---|---|
| `PUT /v1/orgs/{orgId}/trips/{tripId}/headcounts/{headcountId}` | owner, organizer, participating leader | Upsert. Returns `{ session, applied }`. `applied: false` when the server already held the session closed. 409 when the id belongs to another trip. 404 unknown trip. |
| `GET /v1/orgs/{orgId}/trips/{tripId}/headcounts` | same | Sessions newest first with `expected`, `present`, `accounted`, `missing[]`, `closedWithMissing`. |

Travelers and guardians get 403 on both. The dashboard tile (D25 amber) and the guardian status
view will read these rows in later slices.

The Durable Object returns `{ conflict: 'other-trip' }` for the 409 case instead of throwing:
an exception crossing the Durable Object RPC boundary is logged by workerd as an uncaught promise
rejection even when the route maps it. Expected outcomes travel as values.

## KMP core (`api/Headcounts.kt`)

- DTOs mirror `packages/contracts/src/headcount.ts` plus `RosterResponseDto`.
- `HeadcountMark.wireName()`: `present | missing | with_other_group | excused`; UNMARKED has no
  wire form and is omitted from the body (the server treats absence as missing).
- `HeadcountSession.toSyncRequest()`: the whole session; `groupLabel` becomes `groupName`
  unless it is the whole-trip label.
- `headcountFromRoster(id, roster, groupName, openedBy, openedAtDevice)`: travelers of the group
  (or all), sorted by name, all unmarked, PENDING.
- `pushHeadcount(api, orgId, tripId, session)`: one PUT. Ok → SYNCED (also when the server kept
  its closed copy); a rejection or no network keeps PENDING. Outcome strings: `synced`,
  `already-closed`, `rejected:<status>`, `offline`.
- `ApiClient.syncHeadcount`, `listHeadcounts`, `listRoster`.

## Android (`HeadcountViewModel`)

Sample mode (no trip): the fixture, no network, unchanged screen with the "Sample data" chip.

Live mode (signed in on a trip): `ready` loads the roster, seeds the leader's own group (whole
trip when the leader has no group), pushes the open session once so the console can watch, then
keeps marks local. `close()` closes on the device first (final) and pushes; `retrySync()` pushes
again from the "Pending sync" chip. Marks made while a push is in flight win: only the sync flag
is taken from the result when nothing changed meanwhile. Errors are safe texts: 403 → "Only trip
leaders and organizers count heads.", offline → one connection is needed to start a count.

iOS keeps the fixture model this slice (same core API is available through the framework).

## Facts established by tests

- Worker: a leader syncs an open session (unmarked rows are missing), then a closed one; the
  close is final and a replay returns `applied: false`; scope is the group's travelers; unknown
  participation ids are dropped; travelers and guardians cannot sync or list; the organizer can;
  another trip's id is 409 without an uncaught exception in the worker log.
- Core: roster seeding filters to the group's travelers sorted by name; the body omits unmarked
  members and uses wire mark names; the PUT carries the bearer token to the id path; Ok marks
  synced (also `already-closed`); 409 and no network stay pending.
- Android: live mode seeds "Bus A" from the roster, pushes the open session with an empty mark
  list, close pushes the whole session and lands SYNCED; a 403 keeps PENDING with the safe
  message and a later `retrySync` lands SYNCED.

## Deviations found while building

- The core JSON config dropped nulls and default-valued fields when encoding. The open-session push
  lost `closedAtDevice: null` (the API rejects the missing key with 400), and native verify never
  sent `client: "native"`, so a real device would have received no session token. Both are fixed
  by encoding nulls and defaults, with regression tests in `HeadcountsSyncTest` and `ApiClientTest`.

## The room on the row (slice 070, D41)

`GET .../roster` carries `room` on a leader's or traveler's row while a hotel stay covers today
in the trip's zone (`OrgDurableObject.roomsOn(tripId, date)`: the bookings with `checkIn <= date
< checkOut`, the earlier booking's room first); absent outside a stay or without a room. The
phones' seed (`headcountFromRoster`) keeps it on `HeadcountMember.room`, so the head count rows
read "Room 412" at the hotel as the sample always did; nothing else changes on the phones.

## Not done

Push "come now" to a missing traveler. Done since: the head count card on a leader's live Today
(slice 086, below); the
console's dashboard tile reads the real sessions (`command-center-live.md`); the guardian's
status (slice 025, `guardian.md`); iOS live mode (slice 024, `ios-live.md`). Incident auto-creation on `closedWithMissing` landed in slice 013
(`incidents.md`); since slice 078 that card also reaches the owners and organizers by email at
once (`notifications.md`). The room on the Today tab's hotel line landed in slice 075 as
"Your room tonight" (`travel.md`).

## The head count card on a leader's live Today (slice 086)

On a real trip the Today card's groups were empty: the itinerary fed Today, the sessions did
not. A leader's Today refresh now also reads `GET .../headcounts` (`ApiClient.listHeadcounts`)
and the core turns it into the card (`today/TodayLive.kt` `headcountGroupsOf`): today's sessions
only (the server's receipt instant read in the trip's zone), the newest per group, a whole-trip
count under "Whole trip" / "전체 일행", groups in label order, accounted (present, with another
group, excused) as checked in; the console's `latestHeadcountGroups` is the same rule. Before the
first count of the day the card says "No head count yet today." / "오늘은 아직 인원 점검이
없습니다.". A failed or unreachable answer keeps what the card showed.

The card and its buttons ("Open head count", "Incidents") are a leader's: the list route is for
staff, so a traveler's Today now shows no head count card (`TodayUiState.showsHeadcount`,
`TodayModel.showsHeadcount`); a traveler keeps the meeting window link. Sample mode, which mixes
roles, keeps everything.

Facts (tests): core: yesterday's session ignored, the newer of two Bus A counts wins, a
whole-trip count under its label, label order, the totals (`TodayLiveTest`); Android: a leader's
refresh shows Bus A 19 of 20 from the afternoon count, not the morning one, and not yesterday's
Bus B; a traveler's state hides the card; the sample shows it (`TodayViewModelTest`); iOS: a
leader shows the card empty while unreachable, a traveler does not, the zone date of an instant
(`LiveModelsTests`).
