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
- Console unit: the live page lists the plan (the subtitle counts, the bus seats from the
  roster), posts a hotel with the typed fields (the row reads 5 nights), patches a flight's status
  with the kind, and removes a bus (the card goes back to its empty line).
- Browser: add a flight (code, route, times, seats, PNR), set it delayed (the chip follows, the
  seats and PNR stay), add a hotel (5 nights, rooms, confirmation), add a bus with Bus A ticked (2
  of 24 seats from the roster, the groups line), the subtitle counts; remove the hotel.

## Not done

The sealed driver link and the printed roster (D27-style sealed links); provider lookups (flight
status, hotel confirmations); bookings in the trip report; a traveler's own seat or room.
