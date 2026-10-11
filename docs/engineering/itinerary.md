# Itinerary on the API (slice 017)

Implements D24 (single writer: the organizer console edits a draft; mobile reads the published
revision) and the revision half of D19 (numbered revisions, old ones kept) on the API, the
console editor, and the phone's Today screen. Exercised by `apps/api-worker/test/itinerary.test.ts`,
`apps/organizer-web/src/lib/itinerary-api.test.ts`, the live case in
`apps/organizer-web/e2e/itinerary.spec.ts`, `mobile/core/.../today/TodayBuilderTest.kt`, and
the live cases in `TodayViewModelTest.kt`.

## Storage (OrgDurableObject, schema version 7)

| Table | Columns | Notes |
|---|---|---|
| `itinerary_events` | id, trip_id, date, start, end, time_zone, kind, title, place, pax, status, note, sort_order, published, updated_at | The draft: the organizer's working rows. `published` flips to 0 on every write and to 1 on publish. Times are local wall-clock strings in `time_zone`; the server never converts them. |
| `itinerary_revisions` | trip_id, revision, published_at, published_by_name, snapshot | One JSON snapshot per publish. Readers get the latest; old revisions stay for the D19 diff view. |

Days are derived from the trip's `startsOn`..`endsOn` in its time zone, labelled "Day N" until
day labels get their own editor.

## Routes

| Route | Who | Behaviour |
|---|---|---|
| `GET .../itinerary` | any member | Owners and organizers get `view: draft` with `unpublished` (edited or added rows plus rows removed since the last revision); everyone else gets `view: published`, the latest snapshot, empty before the first publish. |
| `PUT .../itinerary/events/{eventId}` | owner, organizer | Create or replace a draft row by client-minted UUID; 409 when the id belongs to another trip. |
| `DELETE .../itinerary/events/{eventId}` | owner, organizer | Remove a draft row; the removal reaches readers at the next publish. |
| `POST .../itinerary/publish` | owner, organizer | `{ expectedRevision }`; snapshots the draft as revision n+1 and marks rows published. 409 when the expected revision is stale (someone published first) or there is nothing to publish. |

Leaders and travelers cannot write (403). Change proposals from leaders (D24) are a later slice.

## Console

`ItineraryPage` keeps the fixture for sample mode and `?state=`. With a trip it loads the draft
and runs the same pure reducer with the API as the side effect of each action: edits debounce
per event (500 ms) and save as one PUT, additions and reorders save at once, removals delete at
once, and Publish flushes pending saves then posts the expected revision. A 409 shows a notice
and reloads the server copy; a failed save shows a notice and is retried by the next edit. The
"Live" chip replaces "Sample data". New events carry UUIDs so the first save and later saves hit
the same row.

## Phone

KMP core `api/Itinerary.kt` (DTOs, `ApiClient.getItinerary`) and `today/TodayBuilder.kt`
(`todaySnapshotOf`: the device date's events in order, kinds and statuses mapped, the day number
from the trip start, pure date arithmetic for the labels). Android `TodayViewModel` is live when
signed in on a trip: it fetches the published itinerary and builds Today for the device's date
and clock in the trip's zone; offline keeps the last snapshot marked offline. The header shows
"Live" or "Syncing". Announcements and head counts on Today still come from their own feeds
(empty in live mode this slice). iOS Today stays on the fixture.

## Facts established by tests

- Worker: a new trip lists every date with no events at revision 0; upserts are unpublished
  drafts; readers see an empty published view and cannot write; a stale expected revision is
  409; publish makes revision 1 with every row published; an edit plus a removal count as two
  unpublished changes while readers still see revision 1; revision 2 carries the new state; the
  same id on another trip is 409.
- Console unit: the API shape maps to the editor shape and back without inventing fields; a
  live editor mints ids, publishes with the server's revision, and reloads cleanly.
- Browser: with the sample trip the editor shows "Live", 13 days, revision 0; add, title, place,
  publish reads revision 1 and "All changes published"; a reload shows the event at revision 1
  and no notice. Capture `itinerary-live.png`.
- Core: epoch-day arithmetic and labels for known dates; a day's snapshot (order, kinds,
  statuses, day number, up-next rule); a date outside the trip is an honest empty day.
- Android: live Today from the published itinerary for the device date and clock; unreachable
  marks offline and keeps the trip name.

## Not done

Day labels, leader change proposals (D24), the revision diff view with required ack (D19),
disruption drafts (D19 AI), iOS live Today, announcements and head counts on the live Today.
