# Travel bookings (slice 046, D37)

The flights, hotels and bus charters an organizer books for a trip, kept as facts to read off
during the trip: the flight code and PNR at the check-in desk, the hotel confirmation at the
reception, which groups ride which bus. No provider integration: references are strings the
organizer types; the itinerary stays the plan the phones read (its flight, bus and hotel events).
Exercised by `apps/api-worker/test/travel.test.ts`, the Travel cases in `sections.test.tsx` and
`apps/organizer-web/e2e/travel.spec.ts`.

## Storage

OrgDurableObject `travel_bookings` (schema 17): `id`, `trip_id`, `kind` (`flight` | `hotel` |
`bus`), `data` (the kind's fields as JSON, validated by the contracts on the way in),
`created_at`. Tier 1. A bus's `driverContact` is organizer-only and never leaves the console
(D13 keeps even room numbers from guardians; drivers are not users, D-travel: they get a sealed
link or a printed roster, not built yet).

| Kind | Fields | Derived |
|---|---|---|
| flight | code, from, to, departsAt, arrivesAt (wall-clock at the place, `YYYY-MM-DDTHH:mm`), pax, pnr, status (`scheduled`, `delayed`, `done`, `cancelled`) | |
| hotel | name, city, checkIn, checkOut (calendar dates), rooms, confirmation | `nights` |
| bus | label, company, seats (1–200), driverContact, groups (roster group names) | `assigned`: travelers and leaders of the roster in those groups |

## Routes (`routes/travel.ts`)

| Route | Who | Behaviour |
|---|---|---|
| `GET .../travel` | owner, organizer, leader | `TravelPlan { flights, hotels, buses, groups, travelers }`, each list in creation order; `groups` are the roster's group names for the bus form. |
| `POST .../travel` | owner, organizer | `CreateBookingRequest` (a discriminated union on `kind`) → 201 `Booking`. A hotel that checks out before it checks in is 400. |
| `PATCH .../travel/{id}` | owner, organizer | `UpdateBookingRequest`: any subset of the kind's fields, with no defaults, merged over the stored row; the kind must match the row (409). A hotel patch that reverses the dates is 400. |
| `DELETE .../travel/{id}` | owner, organizer | Gone. |

Travelers, guardians and strangers are 403; anonymous 401; an unknown trip 404.

## Console (Travel page)

Live once the organization has a trip. Three cards: flights (route, code and PNR, the two
wall-clock times, seats, a status select), hotels (city, dates, nights, rooms, confirmation) and
bus charters (company, driver contact, a seat meter from the roster groups ticked). Each card has
its add form ("Add a flight", "Add a hotel", "Add a bus"; every label is tied to its input by id)
and each row a Remove ("Remove DEMO 901"). A flight's status select is labelled "Status of
<code>"; the chip beside it reads the stored status (cancelled uses the expired tone). The bus
form lists the roster's group names as checkboxes, or says to import a roster with groups. The
subtitle counts the plan: "1 flights · 1 hotels · 1 buses · 3 travelers to move". Evidence:
`web/<project>/travel-live.png`.

## Lesson: a partial schema still fills defaults

`FlightInput.partial()` looked like the natural patch body, but zod applies a field's `.default()`
when the key is absent even under `.partial()`: a status-only patch `{ kind: 'flight', status:
'delayed' }` arrived at the object as `{ status, pax: 0, pnr: '' }` and zeroed the seats and
blanked the PNR. The first browser capture showed "0 seats" where the test had just read 42. The
contract now keeps the field sets without defaults (`FlightFields`, `HotelFields`, `BusFields`),
builds the create bodies by adding defaults, and the patch bodies by `partial()` over the plain
sets. The worker test and the browser spec both assert the seats and the PNR after the status
change.

## On the phones (slice 047)

A leader reads the bookings under each day of the Plan tab; travelers and guardians never ask
(the itinerary carries what they need). The plan route answers a leader with `driverContact:
null` on every bus: the contact never leaves the console (D37, D13). Core
`travel/TravelModel.kt` turns the wire plan into `TripTravel` and reads it off per day with
`bookingsOn(date)`: the flights that depart or arrive that day, the hotels whose stay covers it
as `HotelStay(night)` (1 on the check-in day, `nights + 1` on the check-out morning), and every
bus. The labels are shared: "DEMO 901 · 13:30 → 18:55 · PNR VYS8K2 · 42 seats", "Check-in today ·
5 nights · Rome · 21 rooms", "Night 4 of 5 · …", "Check-out today · …", "Roma Coach · 20 of 45
seats · Groups: Bus A"; a quiet day says "No flight or hotel change this day." and still lists
the buses. Android `PlanViewModel` and iOS `PlanModel` load the bookings after the itinerary
(`ApiClient.travelPlan`); a failure is said once in the plan's error line, offline keeps the
last answer, and before the first answer the section stays hidden rather than empty. Sample mode
shows the fixture's two flights, two hotels and two buses. Evidence: `android/plan-day.png`,
`android/plan-arrival.png`, `ios/plan-day.png`, `ios/plan-arrival.png`.

### The rooming list on the leader's phone (slice 059, D41)

A hotel row under a day of the Plan tab carries "Rooms" for a leader (travelers and guardians
have no bookings section): a read-only screen with the hotel, the summary ("4 of 5 placed · 3 of
21 rooms used"), one section per room in label order (numbers compare as numbers) with the names
in it, leaders in bold, and who has no room yet. Core `travel/RoomingModel.kt` (`roomingOf`,
`byRoom`, `unassigned`, `summary`, `roomLabel`, `spoken`), `ApiClient.rooming`; Android
`plan/RoomingViewModel.kt` and `RoomingScreen.kt` (`Screen.ROOMING`, the hotel chosen on the
row), iOS `Plan/RoomingView.swift` (`RoomingDestination` from the row's link). A failure is
said; offline keeps the last answer; the fixture's list stands in without a trip. Evidence:
`android/rooming-light.png`, `android/rooming-dark.png`, `ios/rooming-light.png`,
`ios/rooming-dark.png`.

## The driver's sealed link (slice 049, D39)

Drivers are not users (D27): they get a sealed, time-limited link, or the printed sheet. An
organizer mints a link on a bus row ("Driver link"); the Worker stores only the token's hash
(`driver_links`, schema 19: trip, booking, hash, created, expires, revoked, opens, last open) and
answers the URL once (`/driver/<orgId>#token=…`, the token in the fragment so browsers never send
it). The link expires thirty days out or two days after the trip ends, whichever comes first, never
under a day (`driverLinkExpiry`). The console lists each link with its opens and a Revoke; a
revoked link keeps its row (the opens stay as a fact). Deleting the bus deletes its links.

The public route `POST /v1/driver/{orgId}` takes the token, needs no session, is rate limited per
address (sixty per quarter hour) and answers `DriverSheet`: the organization and trip, the dates,
the bus (label, company, seats) and, per roster group the bus names, the leaders and the travelers
by name. Nothing else (D13, D27): no driver contact, no guardian, no room, no care note. Each open
counts. Unknown, expired and revoked tokens are one 404 ("This link no longer works. Ask the
organizer for a new one."); the answer carries `Cache-Control: no-store`.

The sheet page (`/driver/$orgId`, `features/driver/DriverSheetPage.tsx`) sits outside the session
gate, posts the token once per open, lists the names (leaders first, travelers numbered in two
columns) and prints cleanly (the brand and the button hide under `@media print`). Evidence:
`web/<project>/driver-sheet.png`; the console side in `travel-live.png`.

## Rooming lists and the hotel's sealed link (slice 058, D41)

A hotel row on the Travel page unfolds its rooming list ("Rooming list for Hotel de la Ville"):
every leader and traveler of the roster (leaders first, then by group and name) with a room
field; a label typed and confirmed (Enter or leaving the field) is saved at once through
`PUT .../travel/{bookingId}/rooming` (`AssignRoomRequest { participationId, room | null }`), the
summary follows ("2 of 3 placed · 1 of 21 rooms used"), a cleared field takes the person out.
`GET .../rooming` is for owners, organizers and leaders (`RoomingList`); travelers and guardians
cannot read it, a guardian cannot be assigned (400), a bus has no list (404). Storage:
`room_assignments(booking_id, participation_id, trip_id, room, updated_at)` (schema 22); a removed
roster row and a deleted hotel take their rows. Guardians never see rooms (D13).

The hotel's sealed link is the driver's sibling: "Hotel link" on the hotel row mints it
(`hotel_links`, the same shape as `driver_links`; `POST/GET .../hotel-links`, `DELETE
.../hotel-links/{linkId}`; the same expiry rule), and the public route `POST /v1/hotel/{orgId}`
(rate limited per address, sixty per quarter hour, `no-store`) answers `HotelSheet`: the stay
(name, city, dates, nights, rooms booked, confirmation), the rooms by label with the names in
them, who has no room yet, the group leaders by name, the count of guests. Nothing else (D13,
D27): no contact, no guardian, no care note, no document. The sheet page (`/hotel/$orgId`,
`features/hotel/HotelSheetPage.tsx`) sits outside the session gate, posts the token once per open,
lists the rooms and prints. Evidence: `web/<project>/travel-rooming.png`,
`web/<project>/hotel-sheet.png`.

## Facts established by tests

- Worker: an empty plan carries the roster's groups and traveler count; a flight, a hotel (5
  nights) and a bus (3 seats assigned: Minji, Juho, leader Kim) are created and listed; a status
  patch and a groups patch apply (4 assigned with Bus B); a patch of another kind is 409, an
  unknown booking 404; a hotel with reversed dates, a bus of zero seats, a bad time and an unknown
  kind are 400; a leader reads but cannot write; a traveler, a guardian and a stranger are 403,
  anonymous 401, an unknown trip 404; a deleted hotel is gone and deleting again is 404.
- Worker: a status-only patch keeps the seats and the PNR (the partial-defaults lesson above).
- Worker: a leader's plan carries `driverContact: null` on every bus; the organizer's keeps the string.
- Core (JVM): the wire plan becomes the phone's bookings; a day holds its flights, the night
  (check-in, night 4 of 5, check-out morning, a move day with both), every bus; the labels in EN
  and KO; a quiet day; the leader's and the organizer's bus decode.
- Android: sample mode carries the fixture bookings; a leader's live plan asks `.../travel` once
  after the itinerary and reads the arrival day; a traveler never asks; unreachable keeps the
  section hidden. Screenshots: the concert day's night and buses; the arrival day's flight and
  check-in.
- iOS: the same model facts on the fixture and on an unreachable server; the captures.
- Worker (slice 049): a link is minted for a bus only (a hotel is 404; a leader and a traveler are
  403), its URL carries the token in the fragment; the sheet opens with no session, names only
  (leaders first; no driver contact, no guardian), with `no-store`; the opens count; an unknown,
  a malformed and a revoked token, and a wrong organization, answer 404 or 400; deleting the bus
  takes its links; the expiry rule's three cases.
- Console unit (slice 049): the bus row mints the link (the URL shows once), lists it with its
  opens and revokes it; the sheet page posts the token once and shows the names by group, and
  says so for a dead or an incomplete link.
- Worker (slice 058): the rooming list starts with everyone unassigned, leaders first; rooms are
  assigned, moved and cleared with the counts following; a guardian is 400, an unknown person 404,
  a blank room 400; a leader reads, a traveler cannot read or write; the hotel link is for a
  hotel only, its sheet opens with no session (the stay, the rooms with their names sorted, the
  unassigned, the leaders, no email anywhere), the open counts, an unknown token is 404, a revoked
  one too; a removed person loses their room; a deleted hotel takes its rooms and links.
- Core (slice 059): the wire list decodes; the rooms come in label order with numbers compared
  as numbers; the unassigned by name; the summary and the spoken rows in both languages; the
  fixture's three rooms and one person unplaced. Android: sample mode shows the fixture; live
  loads the hotel's list from its booking route and reads it by room; refused says why,
  unreachable says offline; the two screenshots. iOS: the same model facts and the captures.
- Console unit (slice 058): the hotel row unfolds the rooming list, a room saves on Enter with
  the summary following, the hotel link mints with the URL shown once; the hotel sheet page
  posts the token once and lists the rooms, the unassigned and the leaders, and says so for a
  dead or an incomplete link. Browser: two rooms through the list, the hotel sheet in a second
  context with the names by room and no driver contact, the open counted; the captures.
- Browser (slice 049): mint on Bus A, open the URL in a session-less context (the sheet shows
  Minji and Juho, not Hana nor the driver contact; capture), the console reads "1 opens" after a
  reload, revoke, and the sheet says the link no longer works.
- Console unit: the live page lists the plan (the subtitle counts, the bus seats from the
  roster), posts a hotel with the typed fields (the row reads 5 nights), patches a flight's status
  with the kind, and removes a bus (the card goes back to its empty line).
- Browser: add a flight (code, route, times, seats, PNR), set it delayed (the chip follows, the
  seats and PNR stay), add a hotel (5 nights, rooms, confirmation), add a bus with Bus A ticked (2
  of 24 seats from the roster, the groups line), the subtitle counts; remove the hotel.

## Not done

A sealed link for a hotel (the rooming list, D27); provider lookups (flight status, hotel
confirmations); bookings in the trip report; a traveler's own seat or room; a Korean sheet for
a Korean driver (the sheet follows the console's language).
