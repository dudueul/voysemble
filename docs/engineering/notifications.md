# Notification lanes (D29, slice 052)

Every event people on a trip should hear about becomes one notification per recipient, in one of
three lanes, with a delivery time the lane decides. The server owns the rules; the phones read
their inbox (slice 053); the console reads the log of what went out. Since slice 088 the server
pushes the priority and normal lanes to registered phones through APNs and FCM (below); the apps
start registering their tokens once the store accounts exist (`notifications.push` stays deferred
until then: today a phone sees its inbox when the app opens).

## Lanes (`lib/notification-rules.ts`, pure)

| Role | Priority (at once, through quiet hours) | Normal (at once; held while quiet hours are on) | Digest (at the guardian digest hour) | Nothing |
|---|---|---|---|---|
| Traveler | required-ack announcement, head-count call | other announcements, itinerary revisions, packing and document reminders | | incidents, proposals |
| Leader | head-count call, incident status, decided proposal | announcements, itinerary revisions, their own packing reminder | | document reminders |
| Guardian | incident status (their traveler) | announcements shared with guardians, packing and document reminders for their traveler | itinerary revisions shared with guardians | anything not shared, head counts, proposals |

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
| A head count closes with people missing (the incident opens) | `incident_status`; and an email, tag `incident` (slice 078) | the guardians of the missing, the leaders of the group; every owner and organizer by email | "Missing after the head count: Minji Park"; "Korea Concert Tour: head count closed with 1 missing · Minji Park" |
| A leader confirms or an organizer resolves an incident | `incident_status` | the guardians of the people on it, the leaders of their groups | "With the group: Minji Park", "Resolved: …" |
| An organizer decides a proposal | `proposal_decided` | the leader who proposed | "Proposal accepted: Breakfast" |
| The morning three days and one day before the start, from 09:00 (the cron, slice 056; `packing.md`) | `packing_reminder` | travelers and leaders with packing left, the guardians of those travelers; one body each, once per morning (`notifyRows`) | "Packing: 3 days to go" |
| The organizer presses "Remind" on a document requirement (slice 060; `documents.md`) | `document_reminder` | the travelers still missing it, the guardians of those travelers; once a day (`notifyRows`) | "Documents: Passport copy still needed" |
| The morning three days and one day before a requirement's due date, from 09:00 (the cron, slice 062; `documents.md`) | `document_reminder` | the same, with the same reference as the nudge: whichever comes first that morning delivers (`notifyRows`) | the same |
| A traveler asks for help from Today (slice 074) | `incident_status` | the leaders of their group, their guardians | "Help asked: Minji Park" |
| A card is opened from a phone: a traveler's help request or a leader's card (slice 076) | an email, tag `incident` (`lib/organizer-mail.ts`, not a lane row) | every owner and organizer of the organization, in their language | "Korea Concert Tour: Minji Park asked for help" / "Korea Concert Tour: incident opened by Kim · Minji Park" |

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

## Phones (slice 053)

The bell in the Today header carries the unread count ("Inbox, 2 unread" to a screen reader) and
opens the inbox: `GET .../notifications/mine` as the app opens, one row per notification with its
lane chip (priority red, normal blue, digest muted), its kind and delivery time ("06:52" today,
"12-30 21:05" before, in the phone's zone), the title bold while unread and the short body. A tap
on an unread row (or its "Mark read") flips it on the phone first; `POST .../notifications/{id}/read`
confirms with the server's row; a refused read goes back with a notice; offline keeps the local
read and says so. Shared rules in `core/.../notifications/InboxModel.kt` (`inboxOf`, `withRead`,
`unreadCount`, `summary`, `laneLabel`, `kindLabel`, `meta`, `spoken`, `bellSpoken`); the screens
are `android-app/.../notifications/InboxScreen.kt` and `ios-app/Voysemble/Notifications/InboxView.swift`;
the fixture's `inbox()` is a leader's concert morning with two unread. Evidence:
`android/inbox-light.png`, `android/inbox-all-read-dark.png`, `ios/inbox-light.png`,
`ios/inbox-all-read-dark.png`; `today-light.png` on both carries the badge.

"Open" on a row (slice 061) reads it and leads to what it points at: an announcement or a
revision to the Bulletin tab, a decided proposal to the Plan tab, a head count or an incident to
the leader's screens (a guardian reads the status on the Today card instead, so their rows show
no Open), a packing reminder to the packing list; a document reminder opens nothing (documents
never live on a phone). The rule is core's `InboxItem.target(role)`; Android resolves it through
`NavViewModel` and the Today tab's `selectTab`, iOS through the Today stack's path
(`TodayPush`, `navigationDestination`).

Android creates the three lane channels at launch (`ui/NotificationChannels.kt`: `lane.priority`
high, `lane.normal` default, `lane.digest` low; names and descriptions in the app's language), so
the phone's settings show them before the first push and a later push can name its channel. The
app never asks to bypass the device's Do Not Disturb: "through quiet hours" is the product's rule
on the server. Push delivery is the next section; the phone's registration waits for the store setup.

## Push (slice 088)

The notification rows are the push queue too; there is no second store to drift from.

**Devices.** `PUT /v1/me/push-device` `{platform: ios|android, token, apnsEnvironment?}` registers
the signed-in session's token (D1 `push_devices`: account, session, platform, token unique, APNs
environment; migration `0008_push_devices.sql`). One device per session: a new token replaces the
session's earlier one, and a token another session held moves here (a reinstall, a second
sign-in). `DELETE /v1/me/push-device` removes it (notifications turned off). Logout deletes the
session's device; a revoked or expired session's device is never pushed to, so a remote wipe
(D28) stops push at once even before the phone hears about it. iOS sends `sandbox` for debug
builds and `production` for TestFlight and the App Store (TestFlight uses the production APNs
host); Android sends none.

**The run** (`lib/push.ts` `runPushes(env, now, {port?, orgId?})`). For every active
organization, the organization object's `duePushes(now)` (schema 24: priority and normal rows with
`deliver_at <= now` and no `pushed_at`, with the recipient's account), every live device of each
recipient, one message per device, then `markPushed(ids, now, outcome)`:

| Outcome | When |
|---|---|
| `sent` | at least one device accepted it |
| `no-device` | the recipient has no live device (never joined, signed out, notifications off) |
| `stale` | the row is more than six hours late (`STALE_AFTER_MS`): this morning's head count call is noise tonight |
| `failed` | every device failed (APNs or FCM answered an error, or the network did) |
| `unconfigured` | the platform has no keys in this environment |
| `before-push` | rows written before schema 24, never pushed |

A device the service calls dead (APNs 410 or `BadDeviceToken`; FCM 404 or `UNREGISTERED`) is
deleted. A failed row is not retried: the inbox still has it, and a retry storm on a provider
outage would arrive as a burst hours late. The digest lane is never pushed (email only). The cron
runs it every ten minutes after the digest; `notifyTrip` and `notifyTripRows` run it at once for
their own organization after writing rows (`pushNow`, never throws), so a head count call
reaches the phones in seconds and the normal rows held by quiet hours go on the first cron run
after they end. The run logs one line of counts and never a token.

**The ports** (`push/PushPort.ts`). `createPushPort(env)`: the fixture where `DEV_MAILBOX` is bound
(local and tests: each message lands in the KV under `push:<token>:…`; a token starting `dead-`
answers invalid and `fail-` failed); otherwise iOS to `ApnsPushPort` and Android to `FcmPushPort`,
each `UnconfiguredPushPort` while its secrets are absent, so an environment without keys runs and
marks rows `unconfigured` instead of failing.

- APNs (`push/apns.ts`): a provider token (ES256 JWT over `APNS_KEY_ID` and `APNS_TEAM_ID`, signed
  with `APNS_KEY` by WebCrypto, `push/jwt.ts`) cached for fifty minutes; `fetch` to
  `api.sandbox.push.apple.com` or `api.push.apple.com` by the device's environment (APNs speaks
  HTTP/2 only and the Workers runtime picks the protocol, which is not yet confirmed against
  Apple: the first staging send is the check; a failure there shows as `failed` rows and the
  fallback is a small relay); topic
  `APNS_TOPIC` (default `com.voysemble.app`); priority lane `apns-priority: 10` with
  `interruption-level: time-sensitive`, normal lane `5` and `active`.
- FCM (`push/fcm.ts`): an RS256 assertion from `FCM_SERVICE_ACCOUNT` exchanged at Google's token
  endpoint for an access token (cached until a minute before it expires); HTTP v1
  `projects/<project_id>/messages:send`; Android channel `lane.priority` with priority HIGH or
  `lane.normal` with NORMAL (the channels Android already creates).

Every message carries the title and short body and, as data, the row's id, trip, kind, lane and
reference, so the app can open its target (`InboxItem.target`) when the person taps it. Nothing
else: no care notes, no location, no token.

**The phone** (core `notifications/PushRegistrar.kt`). The platform hands over the token its
push service gave it; `register(platform, token, apnsEnvironment)` sends it once and remembers it
in the secure store (`push.token`), so an unchanged token on the next launch costs no call; a new
token registers again; a failure remembers nothing so the next launch retries; signed out it
sends nothing. `unregister()` removes it. `SessionManager.clear()` forgets the remembered token
with the session (sign-out and wipe), so the next sign-in registers afresh. The Android and iOS
apps call it once the store accounts exist: Android needs the Firebase project's
`google-services.json` and the Firebase messaging library, iOS the Push Notifications capability
in a provisioning profile (`docs/runbooks/apple.md`, `google.md`).

## The guardian digest email (slice 054)

The digest lane is a queue the cron drains. `wrangler.jsonc` runs `scheduled` every ten minutes
(`triggers.crons`, inherited by the named environments); `index.ts` hands it to
`lib/digest.ts` `runDigests(env, now)`: for every active organization in D1, the organization
object's `dueDigests(now)` (the digest-lane rows with `deliver_at <= now` and no `digested_at`,
grouped per recipient with their trip), one email per group through the `EmailPort`
(`templates.ts` `digestEmail`: the trip's name in the subject with the count, each item's date
and time in the trip's zone, its title and short body, no link, no token, KO or EN by the
account's language), then `markDigested(ids, now, 'emailed')`. A recipient who has not joined
(no account) is marked `'skipped'` without an email: the row still reaches their inbox at the
digest hour when they do. A send that fails leaves the rows for the next run; one organization's
failure never stops the others. The run logs one line with its counts (organizations, emails,
rows, skipped, failed). The organizer's log counts the emailed rows next to the digest lane
("24 · 24 emailed") and says where the hour is set. A run with nothing due costs one D1 read and
one call per organization; a later slice moves the wake-up into the organization object's own
alarm when the number of organizations makes the sweep the wrong shape.

## The organizers' email on a card from the phone (slice 076; the head count's card, slice 078)

Owners and organizers have no app: the lanes above never reach them, and the console shows an
open card only while someone looks at it. So a card opened from a phone (a traveler's "I need
help", slice 074; a leader's card, slice 073) and, since slice 078, the card a head count opens
when it closes with people missing (the most urgent of the three: "<trip>: head count closed
with 1 missing · Minji Park", the leader and the count in the body; a replay of the closed
session mails nothing, a clean close nothing) are mailed at once: `emailOrganizers(env, orgId,
compose)` (`lib/organizer-mail.ts`) reads every owner and organizer with their language
(`memberships` joined to `accounts`) and sends one message each through the `EmailPort`
(`templates.ts` `incidentOpenedEmail`, tag `incident`: the subject names the traveler or the
leader, the body carries the traveler's own words, the people, the trip-zone clock and the
Safety page's link). A card the organizer opened on the console sends nothing. The send never
throws into the route; a failure is logged without the address or the body. A traveler asks
once: while a request of theirs is open, another is 409 (the Today card already says the leaders
know); after it is resolved they may ask again. The production transport is the digest's
(unbound in named environments until the Email Service binding lands). Slice 081: each owner
and organizer turns these emails off or on for themselves on the console's Settings page
(`accounts.incident_emails`, `identity-and-roster.md`); an account that turned them off is left
out of every incident email, and the lanes to leaders and guardians are unaffected.

## Facts established by tests

- Slice 088 (`push.test.ts`, `push-adapters.test.ts`): one token per session (a second replaces
  the first; anonymous 401; a bad body 400) and its removal; a head count call reaches Minji's
  Android phone and Kim's iPhone (sandbox) at once in the priority lane through the fixture, with
  the title and the reference; Sora's dead token is forgotten when the incident's push answers
  invalid; a normal-lane announcement held by quiet hours goes on a later run; a row
  six hours late is marked stale and not sent; without keys rows are marked unconfigured and
  nothing is sent; logout removes the session's device. APNs: the provider token's ES256
  signature verifies with the public key, is reused within its life, the sandbox and production
  hosts and both priorities, 410 is a dead token. FCM: the RS256 assertion verifies, the access
  token is fetched once, the v1 send names the lane's channel, `UNREGISTERED` is a dead token.
  Core (`PushRegistrarTest`): register once, again only for a new token, iOS carries its
  environment and Android none, a failure remembers nothing, signed out sends nothing, off
  removes, sign-out forgets.
- Slice 078 (`incidents.test.ts`): the close that leaves Juho missing mails the owner once (tag
  `incident`, English, "<trip>: head count closed with 1 missing · Juho Kim", the leader and the
  count, the card's title, the Safety link); the replay of the session and the clean close add
  no message.

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
- Core (`InboxModelTest`, `NotificationsTest`): the wire inbox decodes; it becomes the phone's with
  the platform's clock labels; a read flips one row and the server's row replaces it; the summary,
  the meta line and the bell count in both languages; unknown lanes and kinds read as a normal
  announcement; the fixture has five rows, two unread.
- Android (`InboxViewModelTest`, `InboxScreenshotTest`, `NotificationChannelsTest`,
  `TodayScreenshotTest`): sample mode reads without the network; live loads my inbox, a read is
  confirmed or put back with a notice, a second read of the same row sends nothing; unreachable
  says offline on load and keeps a local read with a notice; the device label prints the time today
  and the date before; a tap reads the row on the screen; the three channels with their importance;
  the Today header's bell says "Inbox, 2 unread".
- iOS (`LiveModelsTests`, `CaptureTests`): sample mode reads the fixture; live and unreachable is
  offline and honest; the row label's shape; the two captures.
- Digest (`digest.test.ts`): a revision shared with guardians lands in Sora's digest lane and in no
  email before the digest hour; the run after it mails Sora once (tagged digest, her language, the
  trip in the subject, the moved event in the body, no token), marks the rows, and the log counts
  one emailed of two digest rows (Hana's guardian never joined: skipped, no email); a second run
  sends nothing; a failed send leaves the rows and the next run with a working transport sends
  them; the template in both languages with the trip-zone clock. Console unit: the emailed count
  in the digest column.

## Not done

The apps' push registration and tap handling (waits for the Firebase project and the Apple push
capability; the server and core are done, slice 088); APNs over the Workers runtime confirmed on
staging (above); a per-person switch for push; opening the exact announcement or incident rather than its tab or screen (the
reference is there; the screens open on their own first item); the production email transport (the digest goes
through the same `EmailPort` as the sign-in link, which named environments do not bind yet);
chat mentions; the organizer's mobile digest.
