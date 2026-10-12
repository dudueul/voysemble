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

- The active trip is the organizer's choice (slice 063, below), the same one every page reads;
  other trips show 0 travelers because only the active roster is loaded.
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
  the first alert; its "Open Safety" link lands on `/safety`. Capture `command-center-live.png`.
- Slice 063, unit (`active-trip.test.ts`): the default rule (on today, next to start, ended
  last); a remembered trip wins while it exists, per organization, and is forgotten when it is
  gone; a mounted hook follows a write and a removed listener does not. (`TopBar.test.tsx`): a
  lone trip is named with its status; two make the select, holding the active one, reporting a
  change; no trip shows the organization alone. (`CommandCenterPage.test.ts`): the state rule
  above, case by case. (`CommandCenterView.test.tsx`): the first action is a link where the
  alert leads, a button otherwise; "Open" on the other rows only, never without the callback;
  "New trip" folds out, creates with the typed fields and closes; the offline state retries.
- Slice 063, browser (`trip-switch.spec.ts`): with two trips the soonest upcoming is active; the
  select switches and the choice survives a reload; "Open" switches; "New trip" creates a third
  that becomes active, with the zone of the active trip; the People page follows the choice;
  with the organizations unreachable the first load says offline and Retry brings the live page.

## Trip switching, alert links and offline (slice 063)

**The active trip.** `lib/session.ts` keeps the organizer's choice per organization
(`vy.activeTripId:<orgId>` in local storage; in memory for the page load when storage is
blocked) as an external store: `writeActiveTripId` notifies every mounted `useActiveTrip`, so
every page that reads the trip (the shell, Today, Itinerary and its history, People,
Communication, Travel, Safety, Media, Preparation, Reports, Billing, Notifications, Setup)
follows a switch at once, and their queries, keyed by the trip id, refetch for it. Without a
choice, or when the remembered trip is no longer the organization's, `defaultTrip` picks the
trip that is on today, else the next to start, else the one that ended last (`pickActiveTrip`
is the same rule outside React). Decision D42.

**Where it switches.** The top bar names the trip; with more than one trip the name is a native
`<select>` (`data-testid="trip-switcher"`, labelled "Trip") that writes the choice. The Today
page's Trips panel carries "Open" on every row but the active one (the same write) and "New
trip", which folds out a form (name, dates, the zone starting as the active trip's) that posts
`POST .../trips`, makes the new trip the active one and refreshes the list. Both only in live
mode: the sample has neither.

**Alert links.** An alert's first action is a link when the alert knows where it leads
(`Alert.to`): an open incident's "Open Safety" goes to `/safety`; the sample's alerts go to the
itinerary, the journey graph and Preparation. The other actions stay buttons until their flows
exist.

**Offline.** `commandCenterState` (the page's pure rule) reads the queries: in live mode a failed
organizations or trips read decides first (the offline state for a network failure, the error
state with its reference otherwise); then loading while resolving; a network failure after a
successful load shows that data under the offline banner, "synced" at the time of its fetch; one
before any load is the offline state ("You are offline", Retry, which refetches the
organizations, the trips and the dashboard); any other failure is the error state. TanStack's
`refetchOnReconnect` brings the live data back on its own when the browser reports the network.
Evidence: `web/<project>/command-center-trips.png` (three trips, the camp just created),
`command-center-offline-first.png`.

## Not done

A display name on accounts; a trip switch on the phones (a leader of several trips picks on
sign-in only); archiving a completed trip out of the switch; the alert's second action as a
flow ("Message guardians", "Notify leaders").

## Movements (slice 050)

`fetchLiveDashboard` also reads `GET .../itinerary` (the organizer's draft view) and
`movementsFromItinerary` maps each event to a movement: kind (free time counts as an activity),
title, place, the instant of its wall-clock start in the event's zone, its status, its pax or the
traveler count, its note. Cancelled events are left out. `MovementsPanel` keeps what is between
ninety minutes ago and forty-eight hours ahead, grouped by local day. Evidence:
`web/<project>/command-center-movements.png` (a trip that is on today, three events tomorrow).
