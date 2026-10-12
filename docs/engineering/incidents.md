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
- Slice 074: a traveler asks for help from Today ("I need help", what is wrong optional): a card
  of kind `help` naming only themselves, opened by their name; the leaders of their group and
  their guardians hear "Help asked: <name>" at once; from there the flow is the same. A traveler
  lists the cards naming them, projected further than a guardian's: their own words on a `help`
  card ("Status update about <name>" otherwise), themselves alone, no trail, no note, no guardian
  message.
- Slice 076: a card opened from a phone (a traveler's help request, a leader's card) also reaches
  every owner and organizer by email at once (`notifications.md`); one the organizer opened on
  the console does not. A traveler asks once: a second request while one of theirs is open is
  409; after it is resolved they may ask again.

## Routes

| Route | Who | Behaviour |
|---|---|---|
| `GET /v1/orgs/{orgId}/trips/{tripId}/incidents` | staff; a guardian (slice 016) and a traveler (slice 074), projected | Cards, open first. A guardian gets the cards naming their traveler (`guardianView`); a traveler the cards naming themselves (`travelerView`: their own words on a `help` card, "Status update about <name>" otherwise, themselves alone, no trail, no note, no guardian message). |
| `POST /v1/orgs/{orgId}/trips/{tripId}/incidents` (slice 068) | owner, organizer; a leader for their group (slice 073); a traveler for themselves (slice 074) | `OpenIncidentRequest { title (1..160), participationIds (1..50) }`: a card opened by hand, kind `manual`, open, no head count, opened by "Owner" / "Organizer"; every id must be a traveler of the trip (a guardian, a leader or an unknown id is 404); the leaders of the named travelers' groups and their guardians get "Incident opened: <names>" at once (D29). 201 with the card. A leader (slice 073) names travelers of their own group only (a whole-trip leader any traveler; 403 otherwise), and the card is opened by their name. A traveler (slice 074) names only themselves (403 otherwise): kind `help`, opened by their name, "Help asked: <name>" to the leaders of their group and their guardians; 409 while a request of theirs is open (slice 076). A card opened from a phone is mailed to every owner and organizer at once (slice 076). |
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

Slice 073 (D17): the Incidents screen carries "New incident" for a leader (and in sample mode):
a sheet with what happened and the travelers of the leader's group as checkboxes (the roster
read through `listRoster`, filtered by `openableTravelers(roster, myGroup)` in the core, the
leader's group read off their own row); "Open incident" posts the card (`ApiClient.openIncident`)
and the screen refreshes so the server's card leads the list; sample mode keeps a local card
(`localIncidentCard`). Android `NewIncidentForm` / `NewIncidentSheet`, iOS `NewIncidentForm` in a
sheet from the toolbar. Evidence: `android/incidents-new.png`, `ios/incidents-new.png`.

Slice 074 (D17): Today carries a "NEED HELP?" card for a traveler (and in sample mode, since the
sample is a traveler's phone): before any request, the invitation and "I need help"; the sheet
takes what is wrong (optional, 160 characters) and sends `helpRequestOf(text, me, default)` (the
default title "Asked for help" when the words are blank) through `ApiClient.openIncident`; the
card then reads the request's words and "Your leaders and the organizer know · 07:12" while
open, "Resolved · 07:40" after, with the button back. The card is `helpCardOf(incidents, me,
clock)` in the core: the first card the server lists for the traveler (open first), kept across
refreshes (`listIncidents` for a traveler, projected). Unreachable says "Offline. Find your
leader or call the number on your card."; a refusal names the code. Android `HelpCardView`,
`HelpForm`, `HelpSheet` (`today/HelpCard.kt`), iOS `HelpCardView` and `HelpForm` in a sheet.
Evidence: `android/today-help.png`, `android/today-help-form.png`, `ios/today-help.png`,
`ios/today-help-form.png`.


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

- Slice 073, worker: Kim (Bus A's leader) opens "Minji feels sick" naming Minji, by her own
  name; Hana (Bus B) is outside her group (403); a traveler naming someone else and a guardian
  are 403; the organizer resolves Kim's card; Sora reads both cards about Minji as status
  updates, the open one first. Android: a leader loads Bus A's travelers (Juho, not Hana, not the
  guardian, not herself), opens a card (the POST names Juho), the refreshed list leads with it;
  sample mode offers the fixture's three and keeps a local card. iOS: the sample travelers and
  the local card; unreachable says offline.
- Slice 074, worker: Minji naming Juho, or Juho and herself, is 403; naming herself opens a
  `help` card by "Minji Park"; Kim and Sora hear "Help asked: Minji Park", Minji nothing; her
  list carries her card with her words, herself alone and no trail, not Juho's head count card;
  after Kim confirms, the organizer messages and resolves, she reads it resolved without the
  note or the message while Sora reads the status update with the message; the organizer's
  list carries the kind; she still cannot resolve. Core: the first card naming her, local times,
  null when none; the request's words or the default, 160 characters, herself alone. Android:
  the traveler's view model offers the card, posts her words (trimmed) naming only her, tracks
  the server's card across a refresh, sends the default title for blank words; sample mode
  keeps a local card at 07:12; a leader's trip has no card. iOS: the sample card; unreachable
  says offline with no card; a leader has none. Console unit: a `help` card reads "Asked for
  help from the phone"; the head count's does not.
- Slice 076, worker: the owner's card from the console leaves his mailbox at the sign-in link;
  Kim's card from the phone mails him at once (tag `incident`, English, "<trip>: incident opened
  by Kim · Minji Park", Kim's words, the Safety link); Minji's request mails "<trip>: Minji Park
  asked for help" with her words; a second request while hers is open is 409; once resolved she
  asks again (201).

## Not done

Push delivery of the guardian message (D29 lane); a guardian-facing screen on the phone beyond
the Today card; a note at opening (the title carries it); a one-tap call to the leader from the
help card (no phone numbers are stored, D20); the traveler's card on the console's missing list.
