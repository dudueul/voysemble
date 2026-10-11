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

## Leader change proposals (slice 018, D24)

Leaders cannot edit; they propose. Storage version 8 adds `itinerary_proposals` (kind `edit`,
`add`, or `remove`; the event id; the event's title at filing time; the patch as JSON; note;
status `pending`, `accepted`, `rejected`; who and when; the decision and its note). A proposal
never touches the draft until the organizer accepts it.

| Route | Who | Behaviour |
|---|---|---|
| `POST .../itinerary/proposals` | participating leader, owner, organizer | `{ kind, eventId, patch, note }`. `edit` and `remove` need an existing draft event (404 otherwise); `add` needs a complete event in the patch (400 otherwise). |
| `GET .../itinerary/proposals` | same | Pending first, newest first within a status. Travelers 403. |
| `POST .../itinerary/proposals/{id}/decide` | owner, organizer | `{ decision: accept \| reject, note }`. Accept merges an edit's patch into the draft row, inserts an add as a new row, or deletes the row for a remove; the result is an unpublished draft the organizer publishes as usual. 409 when already decided or when the event vanished (reject it instead). |

Console: a "change proposals from leaders" card above the live editor lists pending and decided
proposals with the patch spelled out field by field, the note, and the leader; Accept reloads
the draft (the editor now seeds its draft count from unpublished rows, so an accepted proposal
reads "1 unpublished change" at once); Reject records the reason.

Phone: Android Today's up-next card has "Propose a change" (a new start time and a note); the
view model posts an `edit` proposal and shows "Proposal sent to the organizer", or the safe error
(403 for non-leaders, offline). Sample mode shows the sent state without a call. The core patch
DTO omits untouched fields on the wire (`EncodeDefault.Mode.NEVER`), because the client encodes
nulls elsewhere and the server reads a null `end` or `note` as "clear" and rejects a null title.
Clearing a field from the phone is therefore not possible this slice; the console can.

## Facts established by tests (slice 018)

- Worker: a traveler cannot propose (403); an unknown event is 404; an `add` without a full event
  is 400; a leader's edit, add, and remove proposals list pending-first and leave the draft
  untouched; the leader cannot decide (403); accepting the edit patches the draft row (start and
  note changed, title kept, unpublished) and accepting the add inserts "Gelato stop"; rejecting
  records the reason; deciding twice is 409; accepting a remove whose event vanished is 409.
- Console unit: init and load seed drafts from unpublished rows; `describePatch` spells out a
  patch. Browser: Kim's proposal appears on the organizer's editor with its patch and note; Accept
  reads "accepted by Organizer", the timeline shows the event at 08:30, "1 unpublished change",
  and Publish reaches revision 2. Capture `itinerary-proposal.png`.
- Core: the proposal body carries only the touched patch field with the bearer token.
- Android: live propose posts the edit with the new start and note and lands on "sent"; a 403
  reads as the safe message; sample mode reports sent without a call.

## Not done

Day labels, proposing from iOS, add and remove proposals from the phone, the revision diff view
with required ack (D19), disruption drafts (D19 AI), iOS live Today, announcements and head
counts on the live Today.
