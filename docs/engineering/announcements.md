# Announcements and acknowledgments (slice 010)

Implements D16 (required acks, escalation list) and the guardian visibility rule of D13 on the
API, the KMP core, and the organizer console. Exercised by `apps/api-worker/test/announcements.test.ts`,
`mobile/core/.../api/AnnouncementsSyncTest.kt`, and `apps/organizer-web/e2e/announcements.spec.ts`.

## Storage (OrgDurableObject, schema version 2)

| Table | Columns | Notes |
|---|---|---|
| `announcements` | id, trip_id, title, body, requires_ack, shared_with_guardians, author_participation_id, author_name, published_at | Newest first by `published_at`. |
| `acks` | announcement_id, participation_id, acked_at_device, received_at | Primary key (announcement, participation): one ack per person, replays are no-ops. |

Ack duty = travelers and leaders of the trip. Guardians never acknowledge and only see items
with `shared_with_guardians = 1`. The organizer (no participation) sees everything.

## Routes

| Route | Who | Behaviour |
|---|---|---|
| `POST /v1/orgs/{orgId}/trips/{tripId}/announcements` | owner, organizer, or a leader participating in the trip | Publishes; `authorName` is the leader's display name or "Organizer". |
| `GET .../announcements` | any member | Filtered for guardians; `myAck` and `ackCount`/`ackTotal` computed per call. |
| `POST .../announcements/{id}/ack` | the caller's own traveler or leader participation | Body `{ackedAtDevice}`; returns `created: false` on replay with the stored timestamps; 400 when the announcement takes no acks. |
| `GET .../announcements/{id}/acks` | owner, organizer, or participating leader | `acked` and `unacked` entries with names and groups. |

## Mobile core

`ApiClient.listAnnouncements` and `ApiClient.ackAnnouncement` send the native bearer token
(`ApiClientConfig.sessionToken`). `mergeAnnouncements(local, remote, clock)` turns server rows
into the device `AnnouncementFeed`: server-acknowledged wins, ids still in the outbox stay
PENDING, everything else is UNACKNOWLEDGED. `replayAckOutbox` posts every queued ack, confirms
on Ok, and leaves failed ids queued for the next attempt.

## Web console

Communication page: announcements list for the active organization's first trip, composer with
`requiresAck` and `sharedWithGuardians`, ack meter per item, "Who has not?" loads the unacked
names on demand. Channels remain a fixture with their own "Sample data" chip (D22, chat slice).

## System announcements: itinerary revisions (slice 020)

Schema version 9 adds `kind` (`announcement` | `itinerary_revision`) and `revision` to
`announcements`. A publish of revision 2 or later that touches today or a later day opens one
required-ack, guardian-shared announcement of kind `itinerary_revision` whose `revision` field
carries the structured `RevisionSummary` (read from `itinerary_revisions.diff`). The body is
fixed EN/KO template text; the other language is stored as a translation with
`provider: system`. Rules, templates, and rendering: `docs/engineering/itinerary.md`
(slice 020 section).

## Not yet

Scheduled nudge pushes, per-announcement audience beyond the guardian flag. Machine translation
of the body landed in slice 015 (`docs/engineering/translation.md`).
