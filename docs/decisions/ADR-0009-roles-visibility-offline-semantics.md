# ADR-0009: Roles, visibility, offline semantics, and moderation

Status: accepted (2026-10-11)

## Context

Decisions D01-D11 fixed the platform shape (storage, crypto, auth, AI boundary, hostnames). They
did not say how the product behaves for a leader on a bus at 06:50, a guardian in another
timezone at 21:30, or an organizer re-planning a typhoon day at 05:40. Fourteen scenario
interviews with the founder (2026-10-11) settled those behaviours. This ADR records them as one
coherent rule set so every slice and every screen can cite it. Log rows: D12-D26.

Running example used throughout: 13-day Korea/Japan concert tour, 36 travelers, 2 buses,
leaders Kim and Park, organizer at a desk in Seoul, guardians in Busan and abroad.

## Actors and identity (D21, D12, D26)

- One global account per human (D1 `accounts`). Login methods per ADR-0007.
- `membership` = account x organization, with org role: `owner`, `organizer`, `leader`, `member`.
- `participation` = membership x trip, with trip role: `leader`, `traveler`, `guardian_of(traveler)`.
  A guardian participation always points at exactly one traveler participation.
- Role is assigned by the invite, never chosen by the invitee. Invite codes are generated from
  roster rows: one code per traveler row, one per guardian contact bound to that traveler row,
  one per leader. Redeeming a code creates membership and participation in one step.
- Organizer first run: create org (name, default language KO or EN) -> create trip from template
  (sample 13-day or blank) -> import roster CSV (`name, group, guardian_name, guardian_contact,
  notes`) -> generate codes -> export PDF/CSV for distribution. Dashboard shows a checklist until
  the four steps are done. The sample trip exists so the console is never empty.
- Apps show an org switcher. An account only ever sees organizations it joined. Each org's data
  sits under that org's DEK (ADR-0005), so cross-org leakage is a key question, not a query filter.

## Visibility matrix (D13, D16, D18, D22)

| Data | Organizer | Leader | Traveler | Guardian |
|---|---|---|---|---|
| Published itinerary | all | all | all | all |
| Itinerary diffs / revisions | all | all | current diff | parent-safe summary |
| Announcements | all | all | all | only if flagged `share_with_guardians` |
| Ack status per person | all | own groups | own | none |
| Head count results | all | own groups | none | own traveler: present / not yet / excused |
| Live meeting-window location | all (during window) | own groups (during window) | own | never |
| Room numbers, bus seats | all | own groups | own | never |
| Sync timestamps, device state | all | none | none | never |
| Photos: trip pool | all | all | all | none |
| Photos: guardian album | all | all | own | approved photos tagged with own traveler or whole group |
| Chat: trip-all | read/write | read/write | read/write | none |
| Chat: group channel | read on incident (audited) | moderate own group | own group | none |
| Chat: traveler->leader 1:1 | read on incident (audited) | own | own | none |
| Chat: guardian->organizer 1:1 | own | none | none | own |
| Person timeline | all | none | none | none |
| Fee ledger | all | none | own balance | own traveler's balance and due date |

Rules behind the table:

1. Guardians get status, not telemetry. No coordinates, no room numbers, no last-sync times. Raw
   telemetry creates false alarms; a leader-confirmed status answers the question.
2. No traveler <-> traveler DM and no guardian <-> leader DM. Travelers are often minors; leaders
   must not carry twenty parent threads. Guardians talk to the organizer.
3. Organizer access to private channels is incident-scoped and written to the audit log with
   the incident id. There is no silent read.

## Announcements and acknowledgments (D16)

- `announcement.requires_ack` is set by the author. Travelers tap "Got it"; the ack is queued
  offline and synced with an idempotency key (`announcementId:participationId`).
- Leaders see the unacked list live per group. They can schedule a nudge push (for example
  06:00) and hand the list to a room check. Unacked at a deadline is a dashboard signal, not an
  automatic escalation.
- Translation: KO <-> EN machine translation through Workers AI (ADR-0006). The original text is
  always shown first; the translation is labelled "machine translation". A bilingual leader may
  replace the machine text; that version is labelled "edited by <name>".
- Guardians receive an announcement only when `share_with_guardians` is set. Their copy is the
  parent-safe body (no room assignments, no ack lists).

## Head count and missing travelers (D14, D25)

- A head count belongs to one leader, one group, one moment. It is created and closed on the
  leader's device; the server stores it on sync. Fields: `headcountId` (client UUID), `groupId`,
  `openedAtDevice`, `closedAtDevice`, `deviceClockSkewHint`, per-participant mark
  (`present`, `missing`, `with_other_group`, `excused`), `syncState` (`pending`, `synced`).
- "Pending sync" is explicit in the UI until the server acknowledges. A closed head count never
  changes after close; corrections are a new head count.
- The missing list is pinned at the top: name, room, last ack time, last meeting-window status.
  One-tap actions: call, push "come to <group> now", mark `with_other_group`, mark `excused`.
- Closing with unresolved missing travelers writes `closedWithMissing=true`, turns the organizer
  dashboard tile amber, and auto-creates an incident card listing the names. No automatic
  location request: D15 opt-in stays in force.

## Location: meeting windows only (D15)

- There is no background tracking. A leader opens a meeting window: `startsAt`, `endsAt`,
  `center`, `radiusMeters` (default 200), `groupIds`.
- A traveler opts in per window; the app sends coarse position only while the window is open
  and the app is foregrounded or the OS grants the short-lived background slot.
- Server state per traveler per window: `inside`, `outside`, `uncertain`, `stale`, `opted_out`.
  Stored in TripLiveDO with TTL to window end + 1 hour, then dropped. Never in the archive.
- Guardians never see window state (visibility matrix).

## Incidents and the person timeline (D17)

- Person timeline (organizer web only): syncs, head-count marks, acks, leader-tagged photos,
  leader notes, incident links. Read-only, sourced from OrgDO canonical data.
- Incident card: opened by the organizer or auto-created (D25). Organizer pings a leader to
  confirm the person's status; the leader answers from mobile (`with_group`, `not_with_group`,
  `unknown`). The answer, the leader's name, and the time are stored on the card.
- Guardian message is sent by the system on the organizer's action, in the guardian's language,
  and names the confirming leader and time. Example: "Minji is with the group. Phone lost.
  Confirmed by leader Kim at 15:42." Photos are attached only if the organizer selects them.
- Every read of a private channel, every status confirmation, and every guardian message is an
  audit event.

## Photos (D18)

- Upload path: client strips EXIF location, uploads ciphertext to R2 under the org DEK
  (ADR-0001 tier 3). A thumbnail derivative is generated server-side for the pool.
- Trip pool: visible to travelers and leaders of the trip by default.
- Workers AI moderation runs on the thumbnail: nudity, and close-up faces of non-member minors.
  Flagged photos are hidden from the pool pending leader review. The model only produces flags;
  the leader decides.
- Guardian album: leader approves per photo and tags the travelers in it (or whole group).
  Guardians see approved photos tagged with their traveler or the whole group.
- The uploader can delete their own photo at any time; deletion removes it from pool and album
  and shreds the object. The audit log keeps the event, not the image.

## Itinerary writers and disruption (D19, D24)

- One writer per trip: the organizer web editor. Mobile shows the published revision read-only.
- Leaders file change proposals from mobile (queued offline). Proposals are diffs against the
  revision the leader saw. The organizer accepts or rejects each proposal in the editor; accept
  produces a new revision.
- Disruption flow: organizer presses "Disruption" on a day. Workers AI drafts 2-3 proposal
  variants (reorder days, swap venues, time and cost notes) with a plain-language explanation
  per variant. The organizer edits and publishes. AI never publishes.
- Publishing a revision produces a diff event for every participant with `requires_ack`. Guardians
  receive the parent-safe summary of the diff.
- All revisions are kept for the trip's life and archived with the trip.

## Retention and deletion (D20)

- Trip close starts a 90-day wrap-up window: photo downloads, final reports, ledger closure.
- At window end the trip's PII key material is crypto-shredded (ADR-0005): names, contacts,
  photos, chat, documents become unreadable. Kept forever: itinerary template, head-count
  statistics, anonymized timing data, audit log (with identifiers replaced by opaque ids).
- Per-person deletion request: shred that person's row key immediately; keep the audit entry
  that a deletion happened. Org-level wrap-up window is configurable 30-365 days.

## Payments (D23)

- Stripe bills the organizer for Voysemble only (per-trip or seat plan), on the web console,
  hosted Checkout and Portal (ADR-0001). No Stripe Connect, no fee collection on behalf of orgs.
- Traveler fees are a ledger in OrgDO: `paid`, `unpaid`, `partial`, `refunded`, `waived` per
  roster row, edited manually or by CSV import from the organizer's bank export.
- Guardians see their traveler's balance and due date on mobile. No card entry on mobile.
- Later phase: optional per-traveler Stripe Checkout link generated on the web, still web-only.

## Consequences

- OrgDO schema needs: `participation`, `invite`, `announcement`, `ack`, `headcount`,
  `headcount_mark`, `incident`, `incident_confirmation`, `photo`, `photo_tag`, `photo_flag`,
  `itinerary_revision`, `change_proposal`, `channel`, `message`, `fee_ledger`, `audit_event`.
  TripLiveDO holds `meeting_window` and `window_state` only.
- KMP core needs an outbox with idempotency keys for acks, head counts, proposals, and photo
  uploads, and a visible `syncState` on every outbox item (D14).
- The organizer web needs: roster import, invite export, person timeline, incident card,
  proposal inbox, disruption flow, guardian album review, fee ledger.
- Mobile needs: today screen with announcements and acks, head count with missing list,
  meeting window join, photo upload with EXIF strip, proposal composer, guardian status view.
- `feature-status.json` carries one `deferred` key per behaviour above so nothing here is
  presented as available before it has evidence. Work graph nodes P2-P5 absorb them.

## Rejected

- Read receipts instead of acks: unreliable on sleeping phones.
- Guardian self-serve timeline: exposes telemetry, causes false alarms.
- Open chat: minors DMing, moderation burden.
- Last-write-wins or CRDT itinerary merge: single writer removes the problem.
- Auto-locate missing travelers: contradicts opt-in windows.
- Stripe Connect: money-transmitter scope for a single operator.
- Keep-everything retention: PIPA liability.
