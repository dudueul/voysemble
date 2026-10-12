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

## Revision diff with required ack (slice 020, D19)

Every publish from revision 2 on is compared with the previous snapshot and, unless the
organizer publishes quietly, announced to the trip with a required ack. The announcement is the
vehicle (D16 ack duty, escalation list, guardian copy) so nothing new had to be built on the
phone for delivery; only the rendering of the structured change lines is new.

### Storage (schema version 9)

| Change | Purpose |
|---|---|
| `itinerary_revisions.diff` (JSON, nullable) | The `RevisionSummary` computed at publish time: counts of added, changed, removed events and up to 50 `RevisionChange` lines. Revision 1 stores every event as "added". Rows published before this slice have `NULL` and read back as no changes. |
| `announcements.kind` (`announcement` \| `itinerary_revision`, default `announcement`) | Marks the system announcement so clients can render the chip and change lines. |
| `announcements.revision` (nullable integer) | The revision the announcement describes; the summary is read from the revision row on every list call, never copied. |

### The diff (`diffRevisions`)

Events are matched by id. An id only in the new snapshot is `added`, only in the old one is
`removed`, and in both with a different `date`, `start`, `end`, `title`, `place`, `kind`,
`status`, `note`, or `pax` is `changed` with the list of differing `fields` and `previousStart`
when the start moved. Lines are ordered by date then start and capped at 50; the counts are
not capped. `day` is the 1-based day number within the trip (0 when the date fell outside the
trip's days).

### The announcement rule

`POST .../itinerary/publish` now takes `{ expectedRevision, notify = true, note = null }` and
returns `{ itinerary, announcementId, diff }`. The Worker decides "today" in the trip's time
zone and passes the organization's default locale. The announcement opens only when all of
these hold:

1. `notify` is true (the organizer can untick "Notify travelers" for a quiet publish, typically
   a typo fix);
2. the new revision is 2 or later (revision 1 is the plan itself, not a change);
3. the diff has at least one change;
4. at least one change is dated today or later in the trip's zone. A diff that only touches past
   days (cleaning up yesterday) is stored for the history view but stays silent.

When it opens, `createAnnouncement` is called with `requiresAck: true`,
`sharedWithGuardians: true` (D13: the guardian sees the same safe summary), `authorName` =
the publishing organizer, `kind: itinerary_revision`, and `revision` = the new number. The
primary body is in the organization's default locale and the other language rides as the
translation with `provider: 'system'` (the translation editor treats it like an edited text,
never re-translates it). The text is fixed template sentences from `composeRevisionBody`;
Workers AI is never asked to paraphrase a change of plan.

| Case | English line | Korean line |
|---|---|---|
| start moved | `Day 4: Colosseum guided tour now 08:30 (was 09:00).` | `4일차: Colosseum guided tour 09:00에서 08:30로 변경되었습니다.` |
| other field(s) | `Day 4: Colosseum guided tour changed (place, note).` | `4일차: Colosseum guided tour 내용이 변경되었습니다 (place, note).` |
| added | `Day 5: Aperitivo added at 18:30.` | `5일차: Aperitivo 18:30에 추가되었습니다.` |
| removed | `Day 5: Free time removed.` | `5일차: Free time 일정이 취소되었습니다.` |

The body opens with "The itinerary was updated: N changes." / "일정이 변경되었습니다: 변경 N건.",
lists at most 10 lines then "And N more." / "그 외 N건.", appends "Note from the organizer: …" /
"주최자 메모: …" when a note was given, and closes with the ack prompt. Titles are "Itinerary
updated" / "일정 변경 안내".

### Console

The live editor gains a "Notify travelers" checkbox (on by default) and a "Note for travelers
(optional)" field next to Publish. After a publish the status line reads
"Revision 2 published · 1 change · travelers notified", or "· quiet" when no announcement
opened (notify off, revision 1, no changes, or past days only).
Communication renders a revision announcement with an "Itinerary update · revision N" chip, the
body with its line breaks, and the structured lines from the summary
("Day 1 · Group check-in · 09:00 → 08:30", "· added 11:15", "· removed", "· place, note
changed") so the organizer sees the same list travelers see. The ack meter and "Who has not?"
work unchanged because it is an ordinary required-ack announcement.

### Phone

Core `AnnouncementDto` carries `kind` and `revision` (`RevisionSummaryDto`); `changeLinesOf`
renders the same lines as the console; `mergeAnnouncements` maps them onto `AnnouncementItem`
(`kind`, `revisionNumber`, `changeLines`, `isRevision`). Bulletin (Android and iOS) shows the
chip "Itinerary update · rev N" and the lines as a bulleted list, collapsing after 10. Android
Today now takes its announcement card from the live feed: the latest required-ack announcement,
unacknowledged first, so a revision lands on the first screen the traveler opens; "Got it"
posts the ack through `ApiClient.ackAnnouncement` and the card flips to acknowledged. iOS Today
keeps its fixture card.

### Facts established by tests (slice 020)

- Worker: with a Korean organization, moving one event, editing another's place and note, and
  adding a third at revision 2 opens one announcement with a KO body of three numbered lines and
  the organizer's note, an EN translation with `provider: system`, `kind: itinerary_revision`,
  `revision: 2`, `requiresAck`, `sharedWithGuardians`; a guardian lists it; a traveler's ack
  counts; a revision that only changes a past day opens nothing; `notify: false` opens nothing
  while the revision still advances and the diff is returned.
- Console unit: `changeLines` spells out moved, added, removed and field-only changes; a
  revision item renders the chip and lines; "Who has not?" and the waiting count are scoped
  per announcement.
- Browser: publishing revision 2 with the start moved to 08:30 and a note reads "Revision 2
  published · 1 change · travelers notified"; Communication shows the chip, the line
  "Day 1 · Group check-in · 09:00 → 08:30", the note, and 0/0 acks (no travelers yet).
- Core: a server revision announcement maps to `isRevision`, `revisionNumber`, and three lines.
- Android: Bulletin screenshot test pins the chip and the first line; Today picks the
  unacknowledged required-ack announcement from the live feed and "Got it" posts to the ack
  route.

## The Plan tab and proposals from both phones (slice 035, D24)

The Plan tab shows the whole published itinerary, one day at a time, on Android and iOS; it was
the "not built" placeholder until this slice. Everything is derived from the same `GET
.../itinerary` answer Today uses; no new route.

### Core (`plan/PlanModel.kt`, `plan/ProposalDraft.kt`)

- `planOf(itinerary)` → `TripPlan(tripName, revision, publishedAt, days, offline,
  minutesSinceSync)`. One `PlanDay` per itinerary day row, in date order: the organizer's label
  (or "Day n" when blank), `dateLabelOf`, the zone and its label, the day number from the trip
  start, the day's events in the organizer's order with the Today mapping (`toTodayEvent`), and
  `nextOrder` (the day's last order + 1, where an added event lands). `emptyTripPlan(tripName)`
  is the honest state before the first answer; `revisionLine()` reads "Revision 3 · published
  2026-12-20" or "Not published yet".
- `TripPlan.initialDayIndex(date)`: the device date when it is a trip day; the first day before
  the trip, the last day after it; inside a gap, the last day before the date.
- `ProposalDraft(kind EDIT | ADD | REMOVE, eventId, note, start, end, title, place, date,
  timeZone, order)` is what the form holds on either phone. `proposalDraftProblem(draft)` names
  what is missing (note; event; HH:mm clocks; title, start and day for an add) or null.
  `ApiClient.sendProposal(orgId, tripId, draft)` posts the right body: an edit carries only the
  start the leader set, a remove carries `{}`, an add carries the whole event with explicit nulls
  (`AddEventPatchDto`, no defaults) as a scheduled activity for the whole group, because the
  server refuses a partial add and reads an absent `end`, `pax` or `note` as missing.
  `proposalFailureMessage(status, code)` (403 → "Only trip leaders propose changes."),
  `proposalOfflineMessage()` and `proposalSentMessage(kind)` are the fixed lines both phones show.

### Android (`plan/PlanViewModel.kt`, `plan/PlanScreen.kt`, `today/ProposeChange.kt`)

The Plan tab: header with the revision line and the Live / Sample chip, day chips (`D4 ·
Concert day`), the day's events with the Today row, and for leaders "Propose a change" on each
event (change time or remove) and "Propose an event for this day" (add). `PlanViewModel` opens
the device date's day on the first answer and keeps the reader's choice on later refreshes; an
unreachable server marks the plan offline. The dialog (`ProposeChangeDialog` around
`ProposeChangeForm`) is shared with Today's up-next card, which now also offers remove and is
shown only to leaders (`canPropose`; sample mode shows it). `TodayViewModel.propose(draft)` and
`PlanViewModel.propose(draft)` have the same contract: sample mode lands on "sent" without a
call, an incomplete draft shows what is missing, and the result line carries OK to clear it.

### iOS (`Plan/PlanView.swift`, `Today/ProposeChange.swift`)

The same tab and the same sheet. `PlanModel` mirrors the Android view model; `TodayModel.propose`
closes the slice 018 gap (proposing from iOS). `ProposeChangeForm` is a plain view so the capture
test renders it filled; the app shows it in a sheet (`ProposeChangeSheet`) from the up-next card
or the Plan tab. `EventRow`, `StatusChip` and `Card` in `TodayView.swift` are shared with the
Plan tab.

### Facts established by tests (slice 035)

- Core (`PlanModelTest`, `ProposalDraftTest`): days in date order with labels, numbers, the
  Today event mapping and the next slot; the revision line; the initial day inside and outside
  the trip; the fixture plan ends on the Today fixture's day; the draft rule's messages; the three
  wire bodies pinned byte for byte (edit with only the start, remove with `{}`, add with explicit
  nulls after the last slot); the fixed lines.
- Android (`PlanViewModelTest`, 5): sample mode shows the fixture on its day and "sends"
  without the network; live builds the plan and opens the device date's day, a refresh keeps the
  reader's day; unreachable marks offline and a send says so; a leader's remove and add post the
  core bodies, an incomplete draft never reaches the network, 403 is explained; travelers are
  read-only. Screenshots `plan-day.png`, `plan-propose-dark.png`.
- iOS (`LiveModelsTests`, +3): live Plan starts without days and goes offline when unreachable,
  a send says so, an incomplete draft never reaches the network, travelers are read-only; sample
  mode opens the concert day and sends nothing; Today's propose works from iOS in sample mode and
  says offline when unreachable; guardians never see it. Captures `plan-day.png`,
  `plan-propose-dark.png`.

## Not done

Day labels on Today, the side-by-side revision history view in the console (the stored diffs
make it a read-only page), disruption drafts (D19 AI), head counts on the live Today, choosing
the kind of an added event (always an activity for the whole group), proposing a new end or
place for an existing event from the phone.
