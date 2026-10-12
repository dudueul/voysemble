# Trip report and the Safety missing list (slice 034)

The organizer's numbers during and after a trip, derived from facts the service already holds:
announcements and their acknowledgments, head counts, incidents, the fee ledger. Nothing is stored
for the report; the server composes it on request and the console renders it, with a CSV export.
The same builder names, per group, the latest closed head count that left travelers missing: the
Safety page's missing list (D25). Exercised by `apps/api-worker/test/report.test.ts` (the pure
helpers, the builder, the route), the Safety and Reports cases in `sections.test.tsx` and
`apps/organizer-web/e2e/reports.spec.ts`.

## Route

`GET /v1/orgs/{orgId}/trips/{tripId}/report` (owner, organizer) answers `TripReport`:

| Field | Meaning |
|---|---|
| `announcements.total`, `requiringAck`, `avgAckRate` | Announcements (not itinerary revisions); the mean acknowledgment rate (0..100) over those that take acks and have recipients, null without one. |
| `headcounts.total`, `closed`, `closedWithMissing`, `avgCloseMinutes`, `lastCloseMinutes` | Minutes are the device's open-to-close time (`HH:mm` to `HH:mm`, a wrap past midnight counts forward); null without a closed count. |
| `incidents.open`, `resolved`, `avgResolveMinutes` | From the incident cards. |
| `fees` | The ledger totals and `collectedPct` (collected / expected); null until a fee row exists. |
| `byDay` | One row per trip day with a fact, oldest first: `day` (1 on the trip's first day, in the trip's time zone), `date`, `announcementsSent`, `ackRate`, `headcounts`, `avgCloseMinutes`, `missing`. |
| `missingNow` | Per group, the latest closed head count that left travelers missing: group, who opened it, when it closed, the missing rows with their mark. |

Helpers in `@voysemble/contracts` (`report.ts`): `minutesBetweenDeviceTimes`, `dateInZone`,
`tripDayIndex`, `latestMissingOf`. The builder lives in `apps/api-worker/src/lib/report.ts` and
is pure; the route gathers the four lists from the Durable Object and calls it.

## Console

- Reports (live with a trip): tiles "Average ack rate", "Last head count closed in", "Open
  incidents", "Fees collected" ("—" without a fact); the two day charts (ack rate, close
  minutes) from `byDay` with their table views; "No facts yet" until the first announcement or
  head count; "Export CSV" downloads `voysemble-report.csv` (one line per day). Without a trip the
  fixture shows (it exports too).
- Safety "Missing at last head count" (live with a trip): one row per missing traveler of each
  group's latest closed count, "Bus A · closed 06:58 by Kim · 1 missing", the mark as a chip, or
  "Nobody missing at the last head count." Leaders act from the phone (call, push, excuse are
  D25 phone actions); the console lists.
- Evidence: `web/<project>/reports-live.png`, `web/<project>/safety-missing-live.png`.

## Facts established by tests

- Helpers: 06:50→06:58 is 8 minutes and 23:55→00:05 is 10; a bad time is null; instants land
  on the right calendar day in Seoul and Rome and fall back to UTC for an unknown zone; day 1 is
  the start date, day 0 the day before.
- Builder: two days of announcements, head counts (one open, one closed clean, one closed with a
  missing traveler), incidents and fees give the expected per-day rows, overall means, counts,
  25 % collected and one group in `missingNow`; empty inputs give nulls and an empty day list.
- `latestMissingOf` keeps only the newest closed count per group and only when it left someone
  missing.
- Route: a leader is 403; after Kim closes Bus A (06:50→06:58) with Juho missing and the owner
  publishes one announcement, the report shows one closed count of 8 minutes with missing, Juho in
  `missingNow`, one announcement requiring acks, one open incident, no fees, one day.
- Console unit: the live missing list shows Juho from the newer count only (the older count's
  two names are gone); the live report fills the four tiles, the "D2: 90%" bar and the CSV text.
- Browser: before any fact the report says so and the tile reads "—"; after the head count and
  the announcement, Safety lists Juho with the group line (capture) and Reports shows 8 min, 1
  open incident, 0 % acks, "—" fees, a D-bar, and the CSV download has the header and the day row.

## Not done

A per-group breakdown; required-documents completion (documents are a later slice); the fixture's
"Required documents" tile stays in sample mode only; exporting the roster or the ledger from here;
Korean strings.
