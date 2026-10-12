# Journey graph (slices 050, 051 and 055, D40, D19)

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

## The disruption card (slice 051, D19)

"If this slips N minutes, what moves?" The organizer picks an event of the day and the minutes
late; `propagate` answers: the slipped event starts later (its length unchanged); each later
event starts at its own time or when the one before it now ends, whichever is later (an open-ended
event ends when it starts, for this purpose); nothing before it moves. The list reads "Breakfast:
09:00 → 09:20", "Bus to Colosseum: 10:10 → 10:20, pushed by the one before", "Lunch keeps 12:30:
130 min of slack absorb it". "Apply to the draft" PUTs every moved event through
`itineraryApi.upsert` (the itinerary's existing create-or-replace route), so the draft carries
the moves as unpublished changes and the Itinerary page publishes them (D19: travelers get the
revision announcement). The graph redraws from the draft at once. Evidence:
`web/<project>/journey-graph-disruption.png`.

## Drafts from the AI port (slice 055, D19)

"Ask AI for drafts" sends the propagated chain (`POST .../itinerary/disruption-drafts`: the
date, the slipped event and its minutes, every event from it on with its planned and propagated
times, the console's language) and lists what comes back: two or three drafts, each a title, a
one-line rationale and its steps ("Move Breakfast: 09:00 → 09:20", "Shorten Lunch: ends 13:10",
"Cut Lunch", "Everything else keeps its time."). "Apply this draft" writes the steps through the
same upsert route as the slip (a cut is the event cancelled in the draft, a shorten its new end,
a move its new start and end); the Itinerary page edits and publishes. The port
(`ai/AiPort.ts`, `translation.md`) answers from Workers AI in a deployed environment with the
binding, from the fixture locally (absorb the slip; shorten the longest later event by the slip so
what follows keeps its time; cut the last later activity, free time or meal), and with nothing
when disabled, which the card says. Thirty asks an hour per account (`rate-limits.md`). Nothing
the model says is stored or sent to anyone: the organizer applies, edits and publishes.
Evidence: `web/<project>/journey-graph-drafts.png`.

## Facts established by tests

- Unit: the sample page still draws the fixture's ten nodes; the live page picks the first day
  with events when the trip has not started, flags the ten-minute gap as a risk on the bus node,
  leaves the cancelled walk out, reads the tight connection and the pending proposal, and
  switches days from the chips. `zonedToIso` (Rome winter and summer, Seoul, UTC) and
  `movementsFromItinerary` (cancelled out, free time as activity, whole group as the count).
- Unit (slice 051): `propagate` pushes what follows only as far as the slack runs out (Breakfast
  slips 20: the bus moves 10, lunch keeps its 130 minutes; the bus slips 200: lunch moves with it;
  the last event moves alone; an unknown event or zero minutes is nothing); the card's apply PUTs
  the two moved events with their new times and says so.
- Browser (`journey-graph.spec.ts`): a trip that is on today; three events tomorrow through the
  itinerary API; the graph page on that day shows three nodes, the bus at risk, the subtitle and
  the tight line; Breakfast slips 20 minutes, the propagation reads as above, applying moves the
  bus node to 10:20 and the Itinerary page counts the unpublished changes; the command center's
  next 48 hours carry the same events; the captures.

- Drafts (slice 055): the fixture port's three drafts for Breakfast slipping twenty minutes
  (absorb; shorten the walk to 15:40; cut the walk), in Korean when asked; the Workers AI port
  sends the model in JSON mode through the gateway, keeps only known event ids and answers null
  on junk, an empty array or a thrown error; the route answers the organizer and refuses a
  leader, an unknown trip and an empty chain. Console unit: the ask shows the drafts and applying
  one PUTs the shortened end and the moves. Browser: the three drafts on the live page and the
  capture.

## Not done

Decisions on proposals from this page (the Itinerary page decides); flights and buses from the
travel bookings as nodes (the itinerary carries them as events today); a disruption that spans
days; the drafts explained to travelers (the revision announcement carries the diff, not the
reason).
