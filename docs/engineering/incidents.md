# Incidents from head counts and the live Safety page (slice 013)

Implements the second half of D25 (a head count that closes with missing travelers auto-creates
an incident card naming them) and the card half of D17 (open, list, resolve with a note) on the
API, and wires the organizer console's Safety page to those cards. Exercised by
`apps/api-worker/test/incidents.test.ts`, the Safety cases in
`apps/organizer-web/src/features/sections/sections.test.tsx`, and
`apps/organizer-web/e2e/headcounts.spec.ts`.

## Storage (OrgDurableObject, schema version 4)

| Table | Columns | Notes |
|---|---|---|
| `incidents` | id, trip_id, kind, status, title, headcount_id, opened_at, opened_by_name, resolved_at, resolved_by_name, resolution_note | `headcount_id` is UNIQUE: one card per head count, so a replay of a closed session returns the same card instead of opening another. `kind` is `headcount_missing` or `manual` (manual cards come with the organizer composer later). |
| `incident_people` | incident_id, participation_id | The travelers the card is about; names and groups are read from `participations` at list time. |

## Behaviour

- `syncHeadcount` now answers `{ session, applied, incidentId }`. After an accepted sync whose
  session is `closedWithMissing`, the Durable Object opens one card titled
  `Head count closed with N missing (<group or Whole trip>, <closedAtDevice>)`, opened by the
  leader's name, listing the missing participations. A replay returns the existing card's id.
- A clean close (every traveler present, excused, or with another group) opens nothing.
- Lists put open cards first, newest first within a status.
- Resolve is a staff action (owner, organizer, participating leader) with an optional note of up
  to 500 characters. A second resolve answers 409; an id from another trip answers 404.
- Travelers and guardians get 403 on list and resolve. The guardian status message of D17 is a
  later slice and will be sent on the organizer's action, never automatically.
- Slice 068: the organizer opens a card by hand for what the head count did not catch (a lost
  passport, a sick traveler); from there the flow is the same: leaders see it on the phone and
  confirm, the organizer sends the guardian message and resolves, the guardian reads the
  projected card.

## Routes

| Route | Who | Behaviour |
|---|---|---|
| `GET /v1/orgs/{orgId}/trips/{tripId}/incidents` | staff | Cards, open first. |
| `POST /v1/orgs/{orgId}/trips/{tripId}/incidents` (slice 068) | owner, organizer | `OpenIncidentRequest { title (1..160), participationIds (1..50) }`: a card opened by hand, kind `manual`, open, no head count, opened by "Owner" / "Organizer"; every id must be a traveler of the trip (a guardian, a leader or an unknown id is 404); the leaders of the named travelers' groups and their guardians get "Incident opened: <names>" at once (D29). 201 with the card. |
| `POST /v1/orgs/{orgId}/trips/{tripId}/incidents/{incidentId}/resolve` | staff | `{ note }`; returns the resolved card. |

## Console (Safety page)

With an organization and a trip, the Incidents card lists the real cards: title, the people,
who opened it and when, and for open cards an inline note field with a Resolve button. The
page subtitle leads with the open count. Without a trip the card shows the fixture with its
"Sample data" chip and a pointer to setup; the meeting-window map and the missing list stay
fixtures with their own chips until their slices.

Slice 064 (D22): an open card also offers "Read <group>'s channel (audited)" and "Read
<traveler>'s channel (audited)" for the named travelers; the read-only thread says the read is
recorded on each traveler's timeline. `chat.md` has the rule.

Slice 068 (D17): the card's header carries "New incident"; the composer folds out above the
list with "What happened" and the roster's travelers as checkboxes ("Minji Park · Bus A");
"Open incident" posts the card, which then leads the list. Evidence:
`web/<project>/safety-manual-incident.png`.

## Mobile

`SyncHeadcountResponseDto.incidentId` and `HeadcountPushResult.incidentId` carry the card id to
the device; the Android close bar already reads "Closed with N missing · incident opened".

## Facts established by tests

- Worker: a close with one unmarked traveler opens exactly one card (kind, status, head count id,
  opener, title, people with group); the replay of the closed session returns the same id; a clean
  close returns `incidentId: null`; a traveler gets 403 on list; a leader lists.
- Worker: the organizer resolves with a note (resolved by "Organizer", note stored, time set); a
  second resolve 409; unknown id 404; a traveler 403; open cards list before resolved ones; a
  participating leader resolves under their own name.
- Console unit: without a trip the fixture list (2 items) and the setup pointer render; with a
  trip the live card shows the people and "Open", the subtitle reads "1 open incident", and
  Resolve posts the note and re-renders as "Resolved by Organizer · Lobby".
- Browser: the organizer sets up org, trip, roster, leader and invites; the leader redeems in a
  second context and PUTs a closed head count with one present; the organizer's Safety page shows
  the card with the missing name and "1 open incident", resolves it with a note, and reads
  "No open incidents". Capture: `docs/captures/web/<project>/safety-live.png`.

## Leader confirmation and the guardian message (slice 016)

The second half of D17. Storage version 6 adds `incident_confirmations` (append-only trail:
status `with_group | not_with_group | unknown`, note, who, role, when) and the guardian message
columns on `incidents` (English and Korean bodies, sent at, sent by).

| Route | Who | Behaviour |
|---|---|---|
| `POST .../incidents/{id}/confirm` | owner, organizer, participating leader | `{ status, note }`; appends to the trail; 409 on a resolved card. |
| `POST .../incidents/{id}/guardian-message` | owner, organizer | Composes both languages from the latest confirmation and stores them; 409 when nobody confirmed yet. Sending again replaces the message. |
| `GET .../incidents` | staff, and now guardians | A guardian gets only the cards naming their traveler, projected: generic title "Status update about <name>", their traveler alone, no trail, no resolution note, the message intact. |

The message is a fixed sentence, never paraphrased by AI: "<names> is with the group. <note>
Confirmed by leader <name> at <HH:mm>." and its Korean counterpart, with the clock in the trip's
time zone. `not_with_group` reads "… not with the group right now. Leaders are handling it."
and `unknown` reads "… status is being checked." Delivery to guardian devices rides the push
lane of a later slice; the guardian app can already read it on list.

Console: the Safety card shows the latest confirmation as a chip ("With the group", "Confirmed
by leader Kim 2 min ago · note"), a "Send guardian message" button on open cards that have a
confirmation, and the sent message in both languages.

Phone: KMP core `incidents/IncidentsModel.kt` (cards, local-first `confirmLocally`, `confirmed`),
`api/Incidents.kt` (DTOs, `toCard`, `mergeIncidents`), `ApiClient.listIncidents` and
`confirmIncident`. Android `IncidentsScreen` (open cards first, three one-tap answers, pending
chip, guardian message) with `IncidentsViewModel` (live when signed in on a trip: list on start,
post an answer at once, keep it pending when offline and replay on refresh; sample fixture
otherwise), reachable from Today next to "Open head count". iOS `IncidentsView` on the fixture.

## Facts established by tests (slice 016)

- Worker: a traveler cannot confirm (403); sending before any confirmation is 409 and a leader
  cannot send (403); the leader's answer with a note lands in the trail with role `leader`; the
  organizer's send yields both bodies naming the people, the note, "leader Kim", and a clock;
  the guardian lists one projected card with the message and cannot confirm; a resolved card
  answers 409 to a confirmation.
- Console unit and browser: the card shows "With the group" and "Confirmed by leader Kim";
  clicking "Send guardian message" renders the English and Korean bodies.
- Core: rows map to cards with clock-rendered times and the locale's guardian text; a pending
  answer survives a merge and becomes the newest trail entry once confirmed; confirm posts the
  wire status and note with the bearer token; an unreachable server is `Unreachable`.
- Android: sample mode records an answer locally with the device clock; live mode lists on
  start, posts an answer into the trail; offline keeps it pending and marks the feed offline,
  and the next refresh replays it once.

- Slice 068, worker: the owner opens "Lost passport at the hotel desk" naming Minji (manual, open,
  no head count, by "Owner"); a leader is 403; a guardian id, an unknown id are 404; a blank
  title and an empty list are 400; the list leads with it; Kim's and Sora's inboxes carry
  "Incident opened: Minji Park" with the card as reference, Minji's nothing; Sora reads "Status
  update about Minji Park"; Kim confirms, the organizer messages and resolves. Console unit: the
  composer lists the travelers, posts the title and the chosen id, closes, and the card leads the
  list. Browser: the same from the Safety page with the capture, and the guardian's projected
  card through the API.

## Not done

Push delivery of the guardian message (D29 lane); a guardian-facing screen on the phone beyond
the Today card; a manual card from the leader's phone (the console opens them, slice 068); a
note at opening (the title carries it).
