# Notification lanes (D29, slice 052)

Every event people on a trip should hear about becomes one notification per recipient, in one of
three lanes, with a delivery time the lane decides. The server owns the rules; the phones read
their inbox; the console reads the log of what went out. Push delivery through the stores is not
set up (`notifications.push` deferred): today a phone sees its inbox when the app opens.

## Lanes (`lib/notification-rules.ts`, pure)

| Role | Priority (at once, through quiet hours) | Normal (at once; held while quiet hours are on) | Digest (at the guardian digest hour) | Nothing |
|---|---|---|---|---|
| Traveler | required-ack announcement, head-count call | other announcements, itinerary revisions | | incidents, proposals |
| Leader | head-count call, incident status, decided proposal | announcements, itinerary revisions | | |
| Guardian | incident status (their traveler) | announcements shared with guardians | itinerary revisions shared with guardians | anything not shared, head counts, proposals |

`laneFor(role, kind, flags)` gives the lane or null. `deliverAt(lane, now, timeZone, quietHours,
digestAt)`: priority is `now`; normal is `now` unless the wall-clock in the trip's zone is inside
the organization's quiet hours (which may cross midnight, default 23:00–06:30), then the moment
they end (today or tomorrow); digest is the next digest hour (today while it is ahead, else
tomorrow). Quiet hours and the digest hour are the organization's settings (Settings page); the
zone is the trip's.

## Events and audiences (the routes call `lib/notify.ts`)

| Event | Kind | Audience | Title |
|---|---|---|---|
| An announcement is published (`POST .../announcements`) | `announcement` | travelers and leaders; guardians when shared | the announcement's title; the body's first 140 characters |
| A revision announcement opens on publish (`POST .../itinerary/publish`, revision 2 onwards) | `itinerary_revision` | the same | the revision announcement |
| A head count opens (`PUT .../headcounts/{id}`, first sync) | `headcount_call` | travelers and leaders of the group (everyone for a whole-trip count) | "Head count: Bus A" |
| A head count closes with people missing (the incident opens) | `incident_status` | the guardians of the missing, the leaders of the group | "Missing after the head count: Minji Park" |
| A leader confirms or an organizer resolves an incident | `incident_status` | the guardians of the people on it, the leaders of their groups | "With the group: Minji Park", "Resolved: …" |
| An organizer decides a proposal | `proposal_decided` | the leader who proposed | "Proposal accepted: Breakfast" |

A second sync of an open head count calls nobody again. `notifyTrip` never throws into the
route: a failure to notify is logged and the thing that happened stands.

## Storage and routes

`notifications(id, trip_id, participation_id, lane, kind, title, body, ref_type, ref_id,
created_at, deliver_at, read_at)` in the organization object (schema 20); a removed roster row
takes its rows with it. `GET .../notifications/mine` (any participant): what has been delivered
by now, newest first, with the unread count; `POST .../notifications/{id}/read`. `GET
.../notifications` (owner, organizer, leader): the last fifty events with their lane counts and
how many normal-lane rows still wait for quiet hours. An organizer without a participation has no
inbox (403); travelers and guardians cannot read the log (403).

## Console

The top bar's bell leads to `/notifications` (`features/notifications/NotificationsPage.tsx`):
one row per event with when, what, the priority, normal and digest counts and the held chip
("4 until quiet hours end"); the lane rules in a line; the push note. A sample log without a
trip. Evidence: `web/<project>/notifications-log.png`.

## Facts established by tests

- Rules (`notification-rules.test.ts`): the lane per role and kind; quiet hours across midnight;
  the normal lane held until they end today or tomorrow; the digest at its hour today or tomorrow;
  the priority lane never waits; `localClock` and `zonedToIso`.
- Worker (`notifications.test.ts`): a shared required-ack announcement reaches travelers in
  priority, leaders and guardians in normal; a plain one skips guardians; a Bus A head count calls
  its travelers and leader and not Bus B, once; a close with Minji missing tells Sora and Kim and
  not Minji or Hana; a confirmation tells the same two; the first publish carries no revision
  notice and the second does; an accepted proposal tells Kim alone; a read is a read and the
  unread count follows; the log counts the lanes; quiet hours around now hold the normal lane and
  let the priority lane through; an organizer has no inbox; travelers and guardians cannot read
  the log.
- Console unit: the sample log; the live log with its lanes and the held chip; the empty log.
  Browser: a shared required-ack announcement and a plain one, the bell, the counts per lane.

## Not done

Push delivery (FCM and APNs: a token per device, the lanes as channels, an opaque event id per
push); the phones' inbox screen (the API is there); the guardian digest email at the digest hour
(the digest rows are there; the sender and the cron are not); chat mentions; the organizer's
mobile digest; packing reminders.
