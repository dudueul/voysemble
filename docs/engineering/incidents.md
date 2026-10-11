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

## Routes

| Route | Who | Behaviour |
|---|---|---|
| `GET /v1/orgs/{orgId}/trips/{tripId}/incidents` | staff | Cards, open first. |
| `POST /v1/orgs/{orgId}/trips/{tripId}/incidents/{incidentId}/resolve` | staff | `{ note }`; returns the resolved card. |

## Console (Safety page)

With an organization and a trip, the Incidents card lists the real cards: title, the people,
who opened it and when, and for open cards an inline note field with a Resolve button. The
page subtitle leads with the open count. Without a trip the card shows the fixture with its
"Sample data" chip and a pointer to setup; the meeting-window map and the missing list stay
fixtures with their own chips until their slices.

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

## Not done

Manual incident creation from the console, leader confirmation from the phone (`with_group`,
`not_with_group`, `unknown`), the guardian status message, the amber dashboard tile on real
sessions, the person timeline.
