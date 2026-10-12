# Journey graph (slice 050, D40)

The console's Journey Graph page draws one day of the itinerary as a dependency chain: the day's
events in start order as nodes (kind-coloured from the categorical palette,
`dataviz-palette.md`), an edge between neighbours carrying the slack, and two cards that read the
chain off: the tight connections and the leaders' pending proposals. The fixture page (slice 008)
keeps the concert-day story for sample mode; with an organization and a trip the page is live.

## Rules (`features/sections/JourneyGraphPage.tsx`)

| Rule | Where |
|---|---|
| The day: `?day=YYYY-MM-DD` when it is a trip day, else today in the trip's zone when the trip is on, else the first day with events, else the first day. Day chips (`D1`, `D2`, …) switch days. | `pickDayDate`, `todayIn` |
| Nodes: the day's events in start order (then the organizer's order); cancelled events and free time are left out. A done event is done, a running one is now, the rest next. | `graphOfDay` |
| Slack: the gap in minutes from one event's end (its start when open-ended) to the next one's start, never below zero. Ten minutes or less is a risk (red edge; a next node reached over it is at risk); twenty or less is tight (amber). | `graphOfDay`, `RISK_SLACK_MIN`, `TIGHT_SLACK_MIN` |
| Tight connections card: every edge at or under twenty minutes as "10:00 Breakfast → 10:10 Bus to Colosseum · 10 min", labelled At risk or Tight. | `LiveJourney` |
| Leader proposals card: the pending proposals from `GET .../itinerary/proposals` ("Kim Daeun: remove Breakfast · Rained out"), with the way to the Itinerary page where the organizer decides. | `LiveJourney`, `proposalsApi.list` |

The subtitle counts ("3 movements on Arrival · 1 tight connection"). The graph is an SVG with a
title per node and a legend, so kind and state are never colour alone. Evidence:
`web/<project>/journey-graph-live.png`.

## Facts established by tests

- Unit: the sample page still draws the fixture's ten nodes; the live page picks the first day
  with events when the trip has not started, flags the ten-minute gap as a risk on the bus node,
  leaves the cancelled walk out, reads the tight connection and the pending proposal, and
  switches days from the chips. `zonedToIso` (Rome winter and summer, Seoul, UTC) and
  `movementsFromItinerary` (cancelled out, free time as activity, whole group as the count).
- Browser (`journey-graph.spec.ts`): a trip that is on today; three events tomorrow through the
  itinerary API; the graph page on that day shows three nodes, the bus at risk, the subtitle and
  the tight line; the command center's next 48 hours carry the same events; the captures.

## Not done

The disruption flow (D19: "what moves if this slips", a proposal into the draft from the graph);
decisions on proposals from this page (the Itinerary page decides); flights and buses from the
travel bookings as nodes (the itinerary carries them as events today).
