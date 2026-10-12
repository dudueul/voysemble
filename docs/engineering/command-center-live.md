# Command center on the API (slice 014)

The organizer's Today page assembles its numbers from the real API once an organization and a
trip exist. The `Dashboard` shape the view has rendered since slice 003 is unchanged; a pure
mapper fills it from API responses, so every existing view state (loading, empty, error,
offline) still comes from the fixture through `?state=` and stays capturable.

## Data flow

| Piece | File | Notes |
|---|---|---|
| Mapper | `lib/live-dashboard.ts` `buildDashboard` | Pure. Trips (status from dates, destination from the time zone's city, hue from the id), traveler count from the roster, ack-requiring announcements with their counts, open incidents as red alerts, newest head count per group. `movements` from the itinerary since slice 050: every event but the cancelled ones at its instant (`zonedToIso` of the wall-clock start in the event's zone), free time as an activity, "whole group" as the traveler count; the panel keeps the next 48 hours. |
| Fetch | `fetchLiveDashboard` | One `Promise.all` over roster, announcements, head counts, incidents of the active trip. |
| Page | `features/command-center/CommandCenterPage.tsx` | Live when `state === 'live'` and a trip exists; fixture otherwise (sample mode without a trip, simulated states with `?state=`). |
| View | `CommandCenterView` | `data.live` swaps the "Sample data" chip for "Live". Panels show an explanatory line when empty. |
| Shell | `AppShell` | The top-bar alert dot reads open incidents of the active trip; the fixture dashboard only feeds it while no trip exists. |

## Rules carried by the mapper

- The active trip is the organization's first trip, the same choice Communication and Safety
  make; other trips show 0 travelers because only the active roster is loaded.
- A group's row is its newest session by `receivedAt`; whole-trip sessions are their own row.
  `checkedIn` is the server's `accounted` (present, excused, with another group), so a close
  with missing travelers reads "k missing" and the meter turns amber (D25).
- Only announcements that require acknowledgment count toward the rate (D16).
- The Travelers tile counts the selected trip's roster whatever its status: a trip in planning
  still has people to manage (the fixture's selected trip is the active one, so it reads 38).
- The organizer's name is the email's local part until accounts carry a display name.

## Facts established by tests

- Unit (`live-dashboard.test.ts`): status by date; destination and name helpers; newest session
  per group with the whole-trip label; open incidents become red alerts naming the people and
  the opener; `buildDashboard` is live, counts travelers only, keeps ack-requiring announcements
  only; its movements come from the itinerary (slice 050).
- Unit (`CommandCenterView.test.tsx`): a live dashboard shows "Live" and no "Sample data"; empty
  panels explain themselves; the head count total reads 0/0.
- Browser (`headcounts.spec.ts`): after the leader's closed head count, the organizer's Today
  page shows "Live", 2 travelers, 1 open alert, Bus A "1/2 · 1 missing", and the incident as
  the first alert. Capture `command-center-live.png`.

## Not done

Trip switching, a display name on accounts, the
"Open Safety" alert action as a real link, offline handling of the live dashboard (a network
error shows the error state with a reference).

## Movements (slice 050)

`fetchLiveDashboard` also reads `GET .../itinerary` (the organizer's draft view) and
`movementsFromItinerary` maps each event to a movement: kind (free time counts as an activity),
title, place, the instant of its wall-clock start in the event's zone, its status, its pax or the
traveler count, its note. Cancelled events are left out. `MovementsPanel` keeps what is between
ninety minutes ago and forty-eight hours ahead, grouped by local day. Evidence:
`web/<project>/command-center-movements.png` (a trip that is on today, three events tomorrow).
