// Copyright 2026- At Day. All rights reserved.
//
// OrgDurableObject: the canonical, single-threaded store for one organization (ADR-0002).
// One instance per organization, addressed by `idFromName(organizationId)`.
//
// Owns: trips, participations (roster rows), and from later slices itineraries, announcements,
// acks, head counts, incidents, photo metadata (slice 043; the bytes sit sealed in R2), ledger,
// org audit.
// Must not: hold cross-org data, talk to other orgs' objects, or run live traffic (TripLiveDO).
// Invariants: every write goes through an RPC method below; schema changes are versioned in
// MIGRATIONS and applied on wake; callers have already been authorized by the Worker.
//
// PII policy: this slice stores display names and group names only (ops tier, plaintext per
// ADR-0001). Guardian contact strings are NOT stored here yet; they travel only inside the
// invite email. Care notes (D27) arrive in a later slice as tier-2 ciphertext.

import { DurableObject } from 'cloudflare:workers';
import type {
  AckStatus,
  Announcement,
  ApplyFeeRequest,
  Booking,
  BusInput,
  CareNote,
  CareNoteStatus,
  ChatChannel,
  ChatChannelKind,
  ChatMessage,
  ChatMessageList,
  ChatSenderRole,
  Currency,
  DocumentItem,
  DocumentRequirement,
  DocumentRequirementList,
  DocumentScanType,
  DocumentState,
  DocumentSummary,
  DriverLink,
  DriverSheet,
  FeeLedger,
  FeeRow,
  FlightInput,
  GuardianFee,
  GuardianStatus,
  HeadcountMark,
  HeadcountSession,
  HotelInput,
  HotelSheet,
  Incident,
  IncidentStatus,
  Itinerary,
  ItineraryEvent,
  ItineraryEventInput,
  ItineraryProposal,
  ItineraryRevision,
  ItineraryRevisionDetail,
  MeetingWindow,
  MyNotifications,
  MyPackingItem,
  MyPackingList,
  MyRoom,
  Notification,
  NotificationEvent,
  NotificationLog,
  OpenWindowRequest,
  PackingItem,
  PackingList,
  PackingTravelerProgress,
  Participation,
  Photo,
  PhotoContentType,
  PhotoFlag,
  PhotoList,
  PhotoUploaderRole,
  ReportedWindowState,
  RevealCareNoteResponse,
  RevisionChange,
  RevisionSummary,
  RoomAssignment,
  RoomingList,
  TimelineEntry,
  TravelerCountStatus,
  TravelPlan,
  Trip,
  TripRole,
  UpdateFeeRequest,
  WindowMember,
  WindowMemberState,
} from '@voysemble/contracts';
import {
  canRemoveChatMessage,
  careNoteIsEmpty,
  channelIdFor,
  channelMembersOf,
  feeStatusOf,
  nightsBetween,
  parseChannelId,
  WINDOW_STALE_MS,
  windowStatusOf,
} from '@voysemble/contracts';
import type { Bindings } from '../env';
import { careKeyFrom, seal, unseal } from '../lib/care-crypto';
import { chatWords } from '../lib/chat-words';
import {
  type AudienceRole,
  deliverAt,
  type LaneFlags,
  laneFor,
  type NotificationKind,
  type QuietHours,
} from '../lib/notification-rules';
import { nowIso } from '../lib/time';

/** Versioned, idempotent schema steps. Append only; never edit an applied step. */
const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        starts_on TEXT NOT NULL,
        ends_on TEXT NOT NULL,
        timezone TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS participations (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id),
        role TEXT NOT NULL,
        display_name TEXT NOT NULL,
        group_name TEXT,
        guardian_of TEXT REFERENCES participations(id),
        account_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS participations_trip_idx ON participations(trip_id);
      CREATE INDEX IF NOT EXISTS participations_account_idx ON participations(account_id);
    `,
  },
  {
    // Slice 010: announcements and idempotent acks (D16).
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS announcements (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        requires_ack INTEGER NOT NULL,
        shared_with_guardians INTEGER NOT NULL,
        author_participation_id TEXT,
        author_name TEXT NOT NULL,
        published_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS announcements_trip_idx ON announcements(trip_id, published_at);
      CREATE TABLE IF NOT EXISTS acks (
        announcement_id TEXT NOT NULL REFERENCES announcements(id),
        participation_id TEXT NOT NULL REFERENCES participations(id),
        acked_at_device TEXT NOT NULL,
        received_at TEXT NOT NULL,
        PRIMARY KEY (announcement_id, participation_id)
      );
    `,
  },
  {
    // Slice 012: head count sessions synced from the leader's device (D14, D25).
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS headcounts (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id),
        group_name TEXT,
        opened_by_participation_id TEXT,
        opened_by_name TEXT NOT NULL,
        opened_at_device TEXT NOT NULL,
        closed_at_device TEXT,
        received_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS headcounts_trip_idx ON headcounts(trip_id, received_at);
      CREATE TABLE IF NOT EXISTS headcount_marks (
        headcount_id TEXT NOT NULL REFERENCES headcounts(id),
        participation_id TEXT NOT NULL REFERENCES participations(id),
        mark TEXT NOT NULL,
        PRIMARY KEY (headcount_id, participation_id)
      );
    `,
  },
  {
    // Slice 013: incident cards (D17, D25). One card per head count that closed with missing
    // travelers (UNIQUE headcount_id keeps replays from opening a second one).
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id),
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        title TEXT NOT NULL,
        headcount_id TEXT UNIQUE REFERENCES headcounts(id),
        opened_at TEXT NOT NULL,
        opened_by_name TEXT NOT NULL,
        resolved_at TEXT,
        resolved_by_name TEXT,
        resolution_note TEXT
      );
      CREATE INDEX IF NOT EXISTS incidents_trip_idx ON incidents(trip_id, opened_at);
      CREATE TABLE IF NOT EXISTS incident_people (
        incident_id TEXT NOT NULL REFERENCES incidents(id),
        participation_id TEXT NOT NULL REFERENCES participations(id),
        PRIMARY KEY (incident_id, participation_id)
      );
    `,
  },
  {
    // Slice 015: one cached KO<->EN translation per announcement (ADR-0006, D16).
    version: 5,
    sql: `
      ALTER TABLE announcements ADD COLUMN translated_body TEXT;
      ALTER TABLE announcements ADD COLUMN translated_locale TEXT;
      ALTER TABLE announcements ADD COLUMN translation_provider TEXT;
      ALTER TABLE announcements ADD COLUMN translation_edited_by TEXT;
    `,
  },
  {
    // Slice 016: leader confirmations and the guardian status message (D17).
    version: 6,
    sql: `
      CREATE TABLE IF NOT EXISTS incident_confirmations (
        id TEXT PRIMARY KEY,
        incident_id TEXT NOT NULL REFERENCES incidents(id),
        status TEXT NOT NULL,
        note TEXT,
        by_participation_id TEXT,
        by_name TEXT NOT NULL,
        by_role TEXT NOT NULL,
        confirmed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS incident_confirmations_idx ON incident_confirmations(incident_id, confirmed_at);
      ALTER TABLE incidents ADD COLUMN guardian_message_en TEXT;
      ALTER TABLE incidents ADD COLUMN guardian_message_ko TEXT;
      ALTER TABLE incidents ADD COLUMN guardian_message_sent_at TEXT;
      ALTER TABLE incidents ADD COLUMN guardian_message_by_name TEXT;
    `,
  },
  {
    // Slice 017: itinerary draft rows and published revisions (D19, D24). The draft is the
    // organizer's working copy; a revision is a JSON snapshot everyone else reads.
    version: 7,
    sql: `
      CREATE TABLE IF NOT EXISTS itinerary_events (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id),
        date TEXT NOT NULL,
        start TEXT NOT NULL,
        end TEXT,
        time_zone TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        place TEXT NOT NULL,
        pax INTEGER,
        status TEXT NOT NULL,
        note TEXT,
        sort_order INTEGER NOT NULL,
        published INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS itinerary_events_trip_idx ON itinerary_events(trip_id, date, sort_order);
      CREATE TABLE IF NOT EXISTS itinerary_revisions (
        trip_id TEXT NOT NULL REFERENCES trips(id),
        revision INTEGER NOT NULL,
        published_at TEXT NOT NULL,
        published_by_name TEXT NOT NULL,
        snapshot TEXT NOT NULL,
        PRIMARY KEY (trip_id, revision)
      );
    `,
  },
  {
    // Slice 018: leader change proposals (D24). A proposal never touches the draft until the
    // organizer accepts it; the patch is stored as JSON exactly as the leader sent it.
    version: 8,
    sql: `
      CREATE TABLE IF NOT EXISTS itinerary_proposals (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id),
        kind TEXT NOT NULL,
        event_id TEXT,
        event_title TEXT,
        patch TEXT NOT NULL,
        note TEXT NOT NULL,
        status TEXT NOT NULL,
        proposed_by_participation_id TEXT,
        proposed_by_name TEXT NOT NULL,
        proposed_at TEXT NOT NULL,
        decided_at TEXT,
        decided_by_name TEXT,
        decision_note TEXT
      );
      CREATE INDEX IF NOT EXISTS itinerary_proposals_trip_idx ON itinerary_proposals(trip_id, status, proposed_at);
    `,
  },
  {
    // Slice 020: revision diffs and the system announcements that carry them (D19).
    version: 9,
    sql: `
      ALTER TABLE itinerary_revisions ADD COLUMN diff TEXT;
      ALTER TABLE announcements ADD COLUMN kind TEXT NOT NULL DEFAULT 'announcement';
      ALTER TABLE announcements ADD COLUMN revision INTEGER;
    `,
  },
  {
    // Slice 027: traveler fee ledger (D23). One row per traveler; amounts in minor units (tier 1,
    // operational: no card data, no bank identifiers, only what the organizer records).
    version: 10,
    sql: `
      CREATE TABLE IF NOT EXISTS fees (
        participation_id TEXT PRIMARY KEY REFERENCES participations(id),
        trip_id TEXT NOT NULL REFERENCES trips(id),
        currency TEXT NOT NULL,
        amount_due_minor INTEGER NOT NULL,
        paid_minor INTEGER NOT NULL DEFAULT 0,
        refunded_minor INTEGER NOT NULL DEFAULT 0,
        due_on TEXT,
        note TEXT,
        updated_at TEXT NOT NULL,
        updated_by_name TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS fees_trip_idx ON fees(trip_id);
    `,
  },
  {
    // Slice 029: meeting windows (D15). The meeting point (center) is the only coordinate pair
    // the service holds, while the window is open; it is nulled at close. Members carry a state
    // their own device judged, never a position (tier 1, ephemeral by design).
    version: 11,
    sql: `
      CREATE TABLE IF NOT EXISTS meeting_windows (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id),
        label TEXT NOT NULL,
        place TEXT NOT NULL,
        radius_m INTEGER NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        group_names TEXT NOT NULL,
        opened_by_participation_id TEXT,
        opened_by_name TEXT NOT NULL,
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        center_lat REAL,
        center_lng REAL
      );
      CREATE INDEX IF NOT EXISTS meeting_windows_trip_idx ON meeting_windows(trip_id, opened_at);
      CREATE TABLE IF NOT EXISTS meeting_window_members (
        window_id TEXT NOT NULL REFERENCES meeting_windows(id),
        participation_id TEXT NOT NULL REFERENCES participations(id),
        state TEXT NOT NULL,
        reported_at TEXT,
        PRIMARY KEY (window_id, participation_id)
      );
    `,
  },
  {
    // Slice 030 (D27): care notes sealed with AES-GCM (nonce + ciphertext, never plain text) and
    // the audit of every reveal. Tier 2 PII: the row is noise without the CARE_NOTE_KEY secret.
    version: 12,
    sql: `
      CREATE TABLE IF NOT EXISTS care_notes (
        participation_id TEXT PRIMARY KEY REFERENCES participations(id),
        trip_id TEXT NOT NULL REFERENCES trips(id),
        iv TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_name TEXT NOT NULL,
        updated_by_role TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS care_reveals (
        id TEXT PRIMARY KEY,
        participation_id TEXT NOT NULL REFERENCES participations(id),
        trip_id TEXT NOT NULL,
        revealed_by_name TEXT NOT NULL,
        revealed_by_role TEXT NOT NULL,
        revealed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS care_reveals_person_idx ON care_reveals(participation_id, revealed_at);
    `,
  },
  {
    // Slice 031 (D28): facts about a roster row that no other table holds (first: the organizer
    // revoked the person's devices). One row per fact, read by the person's timeline.
    version: 13,
    sql: `
      CREATE TABLE IF NOT EXISTS participation_events (
        id TEXT PRIMARY KEY,
        participation_id TEXT NOT NULL REFERENCES participations(id),
        trip_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        by_name TEXT NOT NULL,
        detail TEXT,
        at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS participation_events_person_idx ON participation_events(participation_id, at);
    `,
  },
  {
    // Slice 033 (D22): chat messages in fixed channels derived from the roster, and each
    // reader's last-read instant per channel (unread counts). Tier 1 content, shredded with the
    // trip (D20).
    version: 14,
    sql: `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id),
        channel TEXT NOT NULL,
        sender_key TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        sender_role TEXT NOT NULL,
        body TEXT NOT NULL,
        sent_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_messages_channel_idx ON chat_messages(trip_id, channel, sent_at);
      CREATE TABLE IF NOT EXISTS chat_reads (
        trip_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        reader_key TEXT NOT NULL,
        last_read_at TEXT NOT NULL,
        PRIMARY KEY (trip_id, channel, reader_key)
      );
    `,
  },
  {
    // Slice 043 (D18): photo metadata. The bytes live sealed in R2 (tier 3); this row is tier 1:
    // who uploaded, when, the moderation flag and the leader's review, the album tags. Shredded
    // with the trip (D20).
    version: 15,
    sql: `
      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id),
        uploader_key TEXT NOT NULL,
        uploader_name TEXT NOT NULL,
        uploader_role TEXT NOT NULL,
        day INTEGER NOT NULL,
        taken_at TEXT NOT NULL,
        content_type TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        thumb_bytes INTEGER NOT NULL,
        flag TEXT,
        reviewed_at TEXT,
        reviewed_by_name TEXT,
        album_at TEXT,
        album_by_name TEXT,
        album_group INTEGER NOT NULL DEFAULT 0,
        album_tags TEXT NOT NULL DEFAULT '[]',
        uploaded_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS photos_trip_idx ON photos(trip_id, uploaded_at);
    `,
  },
  {
    // Slice 045 (D27, D36): what a trip needs from every traveler and who handed it in. A scan's
    // bytes sit sealed in R2 (tier 3); the row keeps its type, size and who uploaded it (tier 1).
    version: 16,
    sql: `
      CREATE TABLE IF NOT EXISTS document_requirements (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id),
        name TEXT NOT NULL,
        required INTEGER NOT NULL DEFAULT 1,
        due_on TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS document_requirements_trip_idx ON document_requirements(trip_id, created_at);
      CREATE TABLE IF NOT EXISTS document_items (
        requirement_id TEXT NOT NULL REFERENCES document_requirements(id),
        participation_id TEXT NOT NULL REFERENCES participations(id),
        trip_id TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'missing',
        updated_at TEXT,
        updated_by_name TEXT,
        scan_content_type TEXT,
        scan_bytes INTEGER,
        scan_uploaded_at TEXT,
        scan_uploaded_by_name TEXT,
        PRIMARY KEY (requirement_id, participation_id)
      );
    `,
  },
  {
    // Slice 046 (D37): travel bookings. One row per flight, hotel or bus charter; the kind's
    // fields live as JSON (validated by the contracts on the way in). Tier 1; a bus's driver
    // contact is organizer-only and never leaves the console.
    version: 17,
    sql: `
      CREATE TABLE IF NOT EXISTS travel_bookings (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id),
        kind TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS travel_bookings_trip_idx ON travel_bookings(trip_id, created_at);
    `,
  },
  {
    // Packing checklist (D38, slice 048): the organizer's items and one tick per traveler and item.
    version: 18,
    sql: `
      CREATE TABLE IF NOT EXISTS packing_items (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id),
        name TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS packing_items_trip_idx ON packing_items(trip_id, created_at);
      CREATE TABLE IF NOT EXISTS packing_ticks (
        item_id TEXT NOT NULL REFERENCES packing_items(id),
        participation_id TEXT NOT NULL REFERENCES participations(id),
        trip_id TEXT NOT NULL,
        packed_at TEXT NOT NULL,
        by_role TEXT NOT NULL,
        PRIMARY KEY (item_id, participation_id)
      );
      CREATE INDEX IF NOT EXISTS packing_ticks_participation_idx ON packing_ticks(participation_id);
    `,
  },
  {
    // The driver's sealed link (D27, D39, slice 049): one bus, a token hash, an expiry, a revocation, the opens.
    version: 19,
    sql: `
      CREATE TABLE IF NOT EXISTS driver_links (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id),
        booking_id TEXT NOT NULL REFERENCES travel_bookings(id),
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        opens INTEGER NOT NULL DEFAULT 0,
        last_opened_at TEXT
      );
      CREATE INDEX IF NOT EXISTS driver_links_booking_idx ON driver_links(booking_id, created_at);
    `,
  },
  {
    // Notification lanes (D29, slice 052): one row per recipient and event, with its lane and delivery time.
    version: 20,
    sql: `
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id),
        participation_id TEXT NOT NULL REFERENCES participations(id),
        lane TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        ref_type TEXT NOT NULL,
        ref_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        deliver_at TEXT NOT NULL,
        read_at TEXT
      );
      CREATE INDEX IF NOT EXISTS notifications_participation_idx ON notifications(participation_id, deliver_at);
      CREATE INDEX IF NOT EXISTS notifications_trip_idx ON notifications(trip_id, created_at);
    `,
  },
  {
    // The guardian digest email (D29, slice 054): when the digest run took a digest-lane row and
    // what it did with it ('emailed', or 'skipped' when the recipient had no account); both null
    // until the run after the digest hour.
    version: 21,
    sql: `
      ALTER TABLE notifications ADD COLUMN digested_at TEXT;
      ALTER TABLE notifications ADD COLUMN digest_outcome TEXT;
      CREATE INDEX IF NOT EXISTS notifications_digest_idx ON notifications(lane, deliver_at);
    `,
  },
  {
    // Rooming lists and the hotel's sealed link (D27, D41; slice 058): who sleeps in which room of
    // a hotel booking, and the hotel's link with the driver's shape.
    version: 22,
    sql: `
      CREATE TABLE IF NOT EXISTS room_assignments (
        booking_id TEXT NOT NULL REFERENCES travel_bookings(id),
        participation_id TEXT NOT NULL REFERENCES participations(id),
        trip_id TEXT NOT NULL REFERENCES trips(id),
        room TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (booking_id, participation_id)
      );
      CREATE INDEX IF NOT EXISTS room_assignments_participation_idx ON room_assignments(participation_id);
      CREATE TABLE IF NOT EXISTS hotel_links (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id),
        booking_id TEXT NOT NULL REFERENCES travel_bookings(id),
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        opens INTEGER NOT NULL DEFAULT 0,
        last_opened_at TEXT
      );
      CREATE INDEX IF NOT EXISTS hotel_links_booking_idx ON hotel_links(booking_id, created_at);
    `,
  },
  {
    // Chat moderation (D22; slice 065): a removed message stays as a tombstone, its text gone.
    version: 23,
    sql: `
      ALTER TABLE chat_messages ADD COLUMN removed_at TEXT;
      ALTER TABLE chat_messages ADD COLUMN removed_by_name TEXT;
    `,
  },
];

type ChatMessageRow = {
  id: string;
  trip_id: string;
  channel: string;
  sender_key: string;
  sender_name: string;
  sender_role: string;
  body: string;
  sent_at: string;
  /** Slice 065: set when removed; the body is blank from then on. */
  removed_at: string | null;
  removed_by_name: string | null;
};

/** Who is asking for chat: a participation (phones) or an organizer account (console). */
export type ChatViewer = {
  /** Participation id, or `acct:<accountId>` for an organizer without a participation. */
  readerKey: string;
  participation: Participation | null;
  organizer: boolean;
  name: string;
  role: ChatSenderRole;
  /** The reader's account language: the channel cards' words follow it (slice 064). */
  locale: 'ko' | 'en';
};

type CareNoteRow = {
  participation_id: string;
  trip_id: string;
  iv: string;
  ciphertext: string;
  updated_at: string;
  updated_by_name: string;
  updated_by_role: string;
};

type PhotoRow = {
  id: string;
  trip_id: string;
  uploader_key: string;
  uploader_name: string;
  uploader_role: string;
  day: number;
  taken_at: string;
  content_type: string;
  bytes: number;
  thumb_bytes: number;
  flag: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  album_at: string | null;
  album_by_name: string | null;
  album_group: number;
  album_tags: string;
  uploaded_at: string;
};

/** Who is looking at photos: a participation (phones) or an organizer account (console). */
export type PhotoViewer = {
  /** Participation id, or `acct:<accountId>` for an organizer without a participation. */
  key: string;
  name: string;
  role: 'owner' | 'organizer' | 'leader' | 'traveler' | 'guardian';
  /** For guardians: the traveler they are bound to. */
  guardianOf: string | null;
};

type DocumentRequirementRow = {
  id: string;
  trip_id: string;
  name: string;
  required: number;
  due_on: string | null;
  created_at: string;
};

type DocumentItemRow = {
  requirement_id: string;
  participation_id: string;
  trip_id: string;
  state: string;
  updated_at: string | null;
  updated_by_name: string | null;
  scan_content_type: string | null;
  scan_bytes: number | null;
  scan_uploaded_at: string | null;
  scan_uploaded_by_name: string | null;
};

type TravelBookingRow = {
  id: string;
  trip_id: string;
  kind: string;
  data: string;
  created_at: string;
};

type NotificationRow = {
  id: string;
  trip_id: string;
  participation_id: string;
  lane: string;
  kind: string;
  title: string;
  body: string;
  ref_type: string;
  ref_id: string;
  created_at: string;
  deliver_at: string;
  read_at: string | null;
  /** Slice 054: when the digest run took this row and what it did; null for the other lanes and until the run. */
  digested_at: string | null;
  digest_outcome: 'emailed' | 'skipped' | null;
};

/** One person with packing left (slice 056): their own list, or their traveler's for a guardian. */
export type PackingReminderTarget = {
  participationId: string;
  role: 'traveler' | 'leader' | 'guardian';
  displayName: string;
  /** The traveler's name when the row is a guardian's; null for a traveler's or leader's own list. */
  forTraveler: string | null;
  packed: number;
  total: number;
  missing: string[];
};

/** One guardian's (or anyone's) digest-lane rows due by now, grouped for one email (slice 054). */
export type DueDigest = {
  tripId: string;
  tripName: string;
  timeZone: string;
  participationId: string;
  /** The account the email goes to; null when the person has not joined (the rows wait in the inbox). */
  accountId: string | null;
  displayName: string;
  items: { id: string; kind: string; title: string; body: string; createdAt: string }[];
};

type DriverLinkRow = {
  id: string;
  trip_id: string;
  booking_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  opens: number;
  last_opened_at: string | null;
};

type RoomAssignmentRow = {
  booking_id: string;
  participation_id: string;
  trip_id: string;
  room: string;
  updated_at: string;
};

type PackingItemRow = {
  id: string;
  trip_id: string;
  name: string;
  note: string;
  created_at: string;
};

type PackingTickRow = {
  item_id: string;
  participation_id: string;
  trip_id: string;
  packed_at: string;
  by_role: string;
};

type ProposalRow = {
  id: string;
  trip_id: string;
  kind: string;
  event_id: string | null;
  event_title: string | null;
  patch: string;
  note: string;
  status: string;
  proposed_by_participation_id: string | null;
  proposed_by_name: string;
  proposed_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
  decision_note: string | null;
};

type ItineraryEventRow = {
  id: string;
  trip_id: string;
  date: string;
  start: string;
  end: string | null;
  time_zone: string;
  kind: string;
  title: string;
  place: string;
  pax: number | null;
  status: string;
  note: string | null;
  sort_order: number;
  published: number;
  updated_at: string;
};

type RevisionRow = {
  trip_id: string;
  revision: number;
  published_at: string;
  published_by_name: string;
  snapshot: string;
  diff: string | null;
};

const DIFF_FIELDS = [
  'date',
  'start',
  'end',
  'title',
  'place',
  'kind',
  'status',
  'note',
  'pax',
] as const;

/** Added, removed, and changed events between two snapshots, ordered by date then start. */
export function diffRevisions(
  previous: ItineraryEvent[],
  next: ItineraryEvent[],
  dayOf: (date: string) => number,
): Omit<RevisionSummary, 'revision' | 'fromRevision'> {
  const before = new Map(previous.map((e) => [e.id, e]));
  const after = new Map(next.map((e) => [e.id, e]));
  const changes: RevisionChange[] = [];
  for (const e of next) {
    const was = before.get(e.id);
    if (!was) {
      changes.push({
        kind: 'added',
        eventId: e.id,
        date: e.date,
        day: dayOf(e.date),
        title: e.title,
        start: e.start,
        fields: [],
        previousStart: null,
      });
      continue;
    }
    const fields = DIFF_FIELDS.filter((f) => (was[f] ?? null) !== (e[f] ?? null));
    if (fields.length > 0) {
      changes.push({
        kind: 'changed',
        eventId: e.id,
        date: e.date,
        day: dayOf(e.date),
        title: e.title,
        start: e.start,
        fields: [...fields],
        previousStart: was.start !== e.start ? was.start : null,
      });
    }
  }
  for (const e of previous) {
    if (!after.has(e.id)) {
      changes.push({
        kind: 'removed',
        eventId: e.id,
        date: e.date,
        day: dayOf(e.date),
        title: e.title,
        start: e.start,
        fields: [],
        previousStart: null,
      });
    }
  }
  changes.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return {
    added: changes.filter((c) => c.kind === 'added').length,
    changed: changes.filter((c) => c.kind === 'changed').length,
    removed: changes.filter((c) => c.kind === 'removed').length,
    changes: changes.slice(0, 50),
  };
}

/** Fixed EN and KO sentences for the revision announcement (D19); never paraphrased by AI. */
export function composeRevisionBody(
  summary: Omit<RevisionSummary, 'revision' | 'fromRevision'>,
  note: string | null,
): { title: { en: string; ko: string }; en: string; ko: string } {
  const n = summary.added + summary.changed + summary.removed;
  const lineEn = (c: RevisionChange): string => {
    const where = `Day ${c.day}`;
    if (c.kind === 'added') return `${where}: ${c.title} added at ${c.start}.`;
    if (c.kind === 'removed') return `${where}: ${c.title} removed.`;
    return c.previousStart
      ? `${where}: ${c.title} now ${c.start} (was ${c.previousStart}).`
      : `${where}: ${c.title} changed (${c.fields.join(', ')}).`;
  };
  const lineKo = (c: RevisionChange): string => {
    const where = `${c.day}일차`;
    if (c.kind === 'added') return `${where}: ${c.title} ${c.start}에 추가되었습니다.`;
    if (c.kind === 'removed') return `${where}: ${c.title} 일정이 취소되었습니다.`;
    return c.previousStart
      ? `${where}: ${c.title} ${c.previousStart}에서 ${c.start}로 변경되었습니다.`
      : `${where}: ${c.title} 내용이 변경되었습니다 (${c.fields.join(', ')}).`;
  };
  const shown = summary.changes.slice(0, 10);
  const more = n - shown.length;
  const en = [
    `The itinerary was updated: ${n} change${n === 1 ? '' : 's'}.`,
    ...shown.map(lineEn),
    ...(more > 0 ? [`And ${more} more.`] : []),
    ...(note ? [`Note from the organizer: ${note}`] : []),
    'Please tap "Got it" so your leader knows you have seen this.',
  ].join('\n');
  const ko = [
    `일정이 변경되었습니다: 변경 ${n}건.`,
    ...shown.map(lineKo),
    ...(more > 0 ? [`그 외 ${more}건.`] : []),
    ...(note ? [`주최자 메모: ${note}`] : []),
    '확인하셨으면 "확인" 버튼을 눌러 주세요.',
  ].join('\n');
  return { title: { en: 'Itinerary updated', ko: '일정 변경 안내' }, en, ko };
}

/** An `add` proposal must carry every field the draft row needs. */
function isCompleteEvent(patch: ItineraryProposal['patch']): patch is ItineraryEventInput {
  return (
    typeof patch.date === 'string' &&
    typeof patch.start === 'string' &&
    patch.end !== undefined &&
    typeof patch.timeZone === 'string' &&
    typeof patch.kind === 'string' &&
    typeof patch.title === 'string' &&
    typeof patch.place === 'string' &&
    patch.pax !== undefined &&
    typeof patch.status === 'string' &&
    patch.note !== undefined &&
    typeof patch.order === 'number'
  );
}

/** Every calendar date from start to end inclusive (YYYY-MM-DD arithmetic in UTC, no DST). */
export function datesBetween(startsOn: string, endsOn: string): string[] {
  const out: string[] = [];
  const start = Date.parse(`${startsOn}T00:00:00Z`);
  const end = Date.parse(`${endsOn}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return out;
  for (let t = start; t <= end && out.length < 400; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

type IncidentRow = {
  id: string;
  trip_id: string;
  kind: string;
  status: string;
  title: string;
  headcount_id: string | null;
  opened_at: string;
  opened_by_name: string;
  resolved_at: string | null;
  resolved_by_name: string | null;
  resolution_note: string | null;
  guardian_message_en: string | null;
  guardian_message_ko: string | null;
  guardian_message_sent_at: string | null;
  guardian_message_by_name: string | null;
};

type FeeRowRecord = {
  participation_id: string;
  trip_id: string;
  currency: string;
  amount_due_minor: number;
  paid_minor: number;
  refunded_minor: number;
  due_on: string | null;
  note: string | null;
  updated_at: string;
  updated_by_name: string;
  display_name: string;
  group_name: string | null;
};

type WindowRow = {
  id: string;
  trip_id: string;
  label: string;
  place: string;
  radius_m: number;
  starts_at: string;
  ends_at: string;
  group_names: string;
  opened_by_participation_id: string | null;
  opened_by_name: string;
  opened_at: string;
  closed_at: string | null;
  center_lat: number | null;
  center_lng: number | null;
};

type WindowMemberRow = {
  participation_id: string;
  state: string;
  reported_at: string | null;
  display_name: string;
  group_name: string | null;
};

type ConfirmationRow = {
  id: string;
  incident_id: string;
  status: string;
  note: string | null;
  by_participation_id: string | null;
  by_name: string;
  by_role: string;
  confirmed_at: string;
};

/** HH:mm of an instant in the trip's zone, for the guardian message. */
function localClock(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

/**
 * Guardian status message templates (D17): the traveler's name, what the leader saw, who
 * confirmed and when, plus the leader's note. Both languages are composed so the reader's
 * client picks one; no AI is involved (a fixed sentence must never be paraphrased).
 */
export function composeGuardianMessage(input: {
  names: string[];
  status: 'with_group' | 'not_with_group' | 'unknown';
  note: string | null;
  byName: string;
  byRole: 'leader' | 'organizer';
  clock: string;
}): { en: string; ko: string } {
  const names = input.names.join(', ');
  const plural = input.names.length > 1;
  const roleEn = input.byRole === 'leader' ? 'leader' : 'organizer';
  const roleKo = input.byRole === 'leader' ? '인솔자' : '주최자';
  const stateEn = {
    with_group: `${names} ${plural ? 'are' : 'is'} with the group.`,
    not_with_group: `${names} ${plural ? 'are' : 'is'} not with the group right now. Leaders are handling it.`,
    unknown: `${names}: status is being checked.`,
  }[input.status];
  const stateKo = {
    with_group: `${names} 학생은 그룹과 함께 있습니다.`,
    not_with_group: `${names} 학생은 지금 그룹과 함께 있지 않습니다. 인솔자가 대응 중입니다.`,
    unknown: `${names} 학생의 상태를 확인하는 중입니다.`,
  }[input.status];
  const noteEn = input.note ? ` ${input.note}` : '';
  const noteKo = input.note ? ` ${input.note}` : '';
  return {
    en: `${stateEn}${noteEn} Confirmed by ${roleEn} ${input.byName} at ${input.clock}.`,
    ko: `${stateKo}${noteKo} ${roleKo} ${input.byName} 님이 ${input.clock}에 확인했습니다.`,
  };
}

type HeadcountRow = {
  id: string;
  trip_id: string;
  group_name: string | null;
  opened_by_participation_id: string | null;
  opened_by_name: string;
  opened_at_device: string;
  closed_at_device: string | null;
  received_at: string;
};

type AnnouncementRow = {
  id: string;
  trip_id: string;
  title: string;
  body: string;
  requires_ack: number;
  shared_with_guardians: number;
  author_participation_id: string | null;
  author_name: string;
  published_at: string;
  translated_body: string | null;
  translated_locale: string | null;
  translation_provider: string | null;
  translation_edited_by: string | null;
  kind: string;
  revision: number | null;
};

export type TranslationInput = {
  locale: 'ko' | 'en';
  body: string;
  provider: 'machine' | 'edited' | 'system';
  editedBy: string | null;
};

export type RosterRowInput = {
  displayName: string;
  groupName: string | null;
  guardianName: string | null;
};

type ParticipationRow = {
  id: string;
  trip_id: string;
  role: string;
  display_name: string;
  group_name: string | null;
  guardian_of: string | null;
  account_id: string | null;
  created_at: string;
};

type TripRow = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  timezone: string;
  created_at: string;
};

export class OrgDurableObject extends DurableObject<Env> {
  private organizationId: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.migrate();
      this.organizationId = (await ctx.storage.get<string>('organizationId')) ?? null;
    });
  }

  private migrate(): void {
    const sql = this.ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
    const row = sql
      .exec<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_version')
      .one();
    const current = row.v ?? 0;
    for (const m of MIGRATIONS) {
      if (m.version <= current) continue;
      this.ctx.storage.transactionSync(() => {
        sql.exec(m.sql);
        sql.exec('INSERT INTO schema_version (version) VALUES (?)', m.version);
      });
    }
  }

  /** Binds this object to its organization on first use. Idempotent; mismatch is a bug. */
  async bind(organizationId: string): Promise<void> {
    if (this.organizationId && this.organizationId !== organizationId) {
      throw new Error('OrgDurableObject bound to a different organization');
    }
    if (!this.organizationId) {
      await this.ctx.storage.put('organizationId', organizationId);
      this.organizationId = organizationId;
    }
  }

  private requireOrg(): string {
    if (!this.organizationId) throw new Error('OrgDurableObject not bound');
    return this.organizationId;
  }

  private tripFromRow(r: TripRow): Trip {
    return {
      id: r.id,
      organizationId: this.requireOrg(),
      name: r.name,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      timezone: r.timezone,
      createdAt: r.created_at,
    };
  }

  private participationFromRow(r: ParticipationRow): Participation {
    return {
      id: r.id,
      tripId: r.trip_id,
      role: r.role as TripRole,
      displayName: r.display_name,
      groupName: r.group_name,
      guardianOf: r.guardian_of,
      accountId: r.account_id,
      createdAt: r.created_at,
    };
  }

  async createTrip(input: {
    name: string;
    startsOn: string;
    endsOn: string;
    timezone: string;
  }): Promise<Trip> {
    this.requireOrg();
    const row: TripRow = {
      id: crypto.randomUUID(),
      name: input.name,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      timezone: input.timezone,
      created_at: nowIso(),
    };
    this.ctx.storage.sql.exec(
      'INSERT INTO trips (id, name, starts_on, ends_on, timezone, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      row.id,
      row.name,
      row.starts_on,
      row.ends_on,
      row.timezone,
      row.created_at,
    );
    return this.tripFromRow(row);
  }

  async listTrips(): Promise<Trip[]> {
    this.requireOrg();
    return this.ctx.storage.sql
      .exec<TripRow>('SELECT * FROM trips ORDER BY starts_on, created_at')
      .toArray()
      .map((r) => this.tripFromRow(r));
  }

  async getTrip(tripId: string): Promise<Trip | null> {
    this.requireOrg();
    const rows = this.ctx.storage.sql
      .exec<TripRow>('SELECT * FROM trips WHERE id = ?', tripId)
      .toArray();
    const r = rows[0];
    return r ? this.tripFromRow(r) : null;
  }

  /**
   * Imports roster rows atomically: one traveler participation per row, plus one guardian
   * participation bound to it when a guardian name is present. Returns everything created.
   */
  async importRoster(tripId: string, rows: RosterRowInput[]): Promise<Participation[]> {
    this.requireOrg();
    if (!(await this.getTrip(tripId))) throw new Error('trip not found');
    const created: ParticipationRow[] = [];
    const at = nowIso();
    this.ctx.storage.transactionSync(() => {
      for (const r of rows) {
        const traveler: ParticipationRow = {
          id: crypto.randomUUID(),
          trip_id: tripId,
          role: 'traveler',
          display_name: r.displayName,
          group_name: r.groupName,
          guardian_of: null,
          account_id: null,
          created_at: at,
        };
        this.insertParticipation(traveler);
        created.push(traveler);
        if (r.guardianName) {
          const guardian: ParticipationRow = {
            id: crypto.randomUUID(),
            trip_id: tripId,
            role: 'guardian',
            display_name: r.guardianName,
            group_name: r.groupName,
            guardian_of: traveler.id,
            account_id: null,
            created_at: at,
          };
          this.insertParticipation(guardian);
          created.push(guardian);
        }
      }
    });
    return created.map((r) => this.participationFromRow(r));
  }

  /** Adds a leader participation (leaders are not roster rows; organizers add them by name). */
  async addLeader(
    tripId: string,
    displayName: string,
    groupName: string | null,
  ): Promise<Participation> {
    this.requireOrg();
    if (!(await this.getTrip(tripId))) throw new Error('trip not found');
    const row: ParticipationRow = {
      id: crypto.randomUUID(),
      trip_id: tripId,
      role: 'leader',
      display_name: displayName,
      group_name: groupName,
      guardian_of: null,
      account_id: null,
      created_at: nowIso(),
    };
    this.insertParticipation(row);
    return this.participationFromRow(row);
  }

  private insertParticipation(p: ParticipationRow): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO participations
        (id, trip_id, role, display_name, group_name, guardian_of, account_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      p.id,
      p.trip_id,
      p.role,
      p.display_name,
      p.group_name,
      p.guardian_of,
      p.account_id,
      p.created_at,
    );
  }

  /** Rename or regroup a row (slice 028). Role and binding never change here. */
  async updateParticipation(
    tripId: string,
    participationId: string,
    patch: { displayName?: string | undefined; groupName?: string | null | undefined },
  ): Promise<Participation | { notFound: true }> {
    this.requireOrg();
    const existing = await this.getParticipation(participationId);
    if (!existing || existing.tripId !== tripId) return { notFound: true };
    const displayName = patch.displayName ?? existing.displayName;
    const groupName = patch.groupName === undefined ? existing.groupName : patch.groupName;
    this.ctx.storage.sql.exec(
      'UPDATE participations SET display_name = ?, group_name = ? WHERE id = ?',
      displayName,
      groupName,
      participationId,
    );
    return { ...existing, displayName, groupName };
  }

  /**
   * Remove a row that nobody has joined yet, together with the guardians bound to a traveler
   * (slice 028). Refused with the joined ids when the row or a bound guardian has an account:
   * a person who joined is revoked (D28), not erased. Marks, fee rows and incident links of the
   * removed rows go with them; the invite codes are revoked by the route (they live in D1).
   */
  async removeParticipation(
    tripId: string,
    participationId: string,
  ): Promise<{ removed: string[] } | { notFound: true } | { joined: string[] }> {
    this.requireOrg();
    const sql = this.ctx.storage.sql;
    const target = await this.getParticipation(participationId);
    if (!target || target.tripId !== tripId) return { notFound: true };
    const bound = target.role === 'traveler' ? await this.guardiansOf(tripId, target.id) : [];
    const rows = [target, ...bound];
    const joined = rows.filter((r) => r.accountId).map((r) => r.id);
    if (joined.length > 0) return { joined };
    // Guardians first: their guardian_of points at the traveler row (foreign key).
    this.ctx.storage.transactionSync(() => {
      for (const r of [...bound, target]) {
        sql.exec('DELETE FROM acks WHERE participation_id = ?', r.id);
        sql.exec('DELETE FROM headcount_marks WHERE participation_id = ?', r.id);
        sql.exec('DELETE FROM incident_people WHERE participation_id = ?', r.id);
        sql.exec('DELETE FROM fees WHERE participation_id = ?', r.id);
        sql.exec('DELETE FROM care_reveals WHERE participation_id = ?', r.id);
        sql.exec('DELETE FROM care_notes WHERE participation_id = ?', r.id);
        sql.exec('DELETE FROM participation_events WHERE participation_id = ?', r.id);
        sql.exec('DELETE FROM document_items WHERE participation_id = ?', r.id);
        sql.exec('DELETE FROM room_assignments WHERE participation_id = ?', r.id);
        sql.exec('DELETE FROM packing_ticks WHERE participation_id = ?', r.id);
        sql.exec('DELETE FROM notifications WHERE participation_id = ?', r.id);
        sql.exec('DELETE FROM chat_reads WHERE reader_key = ?', r.id);
        sql.exec('DELETE FROM participations WHERE id = ?', r.id);
      }
    });
    return { removed: rows.map((r) => r.id) };
  }

  async listRoster(tripId: string): Promise<Participation[]> {
    this.requireOrg();
    return this.ctx.storage.sql
      .exec<ParticipationRow>(
        'SELECT * FROM participations WHERE trip_id = ? ORDER BY group_name, role, display_name',
        tripId,
      )
      .toArray()
      .map((r) => this.participationFromRow(r));
  }

  /**
   * Roster rows with each person's latest acknowledgment (server receipt time) for the People
   * page (slice 023). One correlated subquery per row over `acks`; rosters are at most a few
   * hundred rows.
   */
  async listRosterWithAcks(
    tripId: string,
  ): Promise<(Participation & { lastAckAt: string | null; hasCareNote: boolean })[]> {
    this.requireOrg();
    return this.ctx.storage.sql
      .exec<ParticipationRow & { last_ack_at: string | null; has_care_note: number }>(
        `SELECT p.*, (SELECT MAX(a.received_at) FROM acks a WHERE a.participation_id = p.id) AS last_ack_at,
                EXISTS(SELECT 1 FROM care_notes c WHERE c.participation_id = p.id) AS has_care_note
         FROM participations p WHERE p.trip_id = ? ORDER BY p.group_name, p.role, p.display_name`,
        tripId,
      )
      .toArray()
      .map((r) => ({
        ...this.participationFromRow(r),
        lastAckAt: r.last_ack_at,
        hasCareNote: r.has_care_note === 1,
      }));
  }

  async getParticipation(participationId: string): Promise<Participation | null> {
    this.requireOrg();
    const r = this.ctx.storage.sql
      .exec<ParticipationRow>('SELECT * FROM participations WHERE id = ?', participationId)
      .toArray()[0];
    return r ? this.participationFromRow(r) : null;
  }

  /** Called on invite redemption. Refuses to rebind a row already owned by another account. */
  async bindAccount(participationId: string, accountId: string): Promise<Participation> {
    this.requireOrg();
    const existing = await this.getParticipation(participationId);
    if (!existing) throw new Error('participation not found');
    if (existing.accountId && existing.accountId !== accountId) {
      throw new Error('participation already bound');
    }
    this.ctx.storage.sql.exec(
      'UPDATE participations SET account_id = ? WHERE id = ?',
      accountId,
      participationId,
    );
    return { ...existing, accountId };
  }

  /**
   * Lost or stolen device (D28): the row forgets its account so the person re-enrols with a fresh
   * code on a new phone; the group, role and every recorded fact stay on the row.
   */
  async unbindAccount(
    tripId: string,
    participationId: string,
    byName: string,
    now: string,
  ): Promise<{ accountId: string } | { notFound: true } | { notJoined: true }> {
    this.requireOrg();
    const p = await this.getParticipation(participationId);
    if (!p || p.tripId !== tripId) return { notFound: true };
    if (!p.accountId) return { notJoined: true };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        'UPDATE participations SET account_id = NULL WHERE id = ?',
        participationId,
      );
      this.ctx.storage.sql.exec(
        'INSERT INTO participation_events (id, participation_id, trip_id, kind, by_name, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(),
        participationId,
        tripId,
        'devices_revoked',
        byName,
        null,
        now,
      );
    });
    return { accountId: p.accountId };
  }

  /** The caller's participation in a trip, if any (one account has at most one per trip here). */
  async participationForAccount(tripId: string, accountId: string): Promise<Participation | null> {
    this.requireOrg();
    const r = this.ctx.storage.sql
      .exec<ParticipationRow>(
        'SELECT * FROM participations WHERE trip_id = ? AND account_id = ? LIMIT 1',
        tripId,
        accountId,
      )
      .toArray()[0];
    return r ? this.participationFromRow(r) : null;
  }

  /** Every participation of an account in this organization, with its trip. */
  async participationsForAccount(
    accountId: string,
  ): Promise<{ trip: Trip; participation: Participation }[]> {
    this.requireOrg();
    const rows = this.ctx.storage.sql
      .exec<
        ParticipationRow & {
          t_id: string;
          t_name: string;
          t_starts_on: string;
          t_ends_on: string;
          t_timezone: string;
          t_created_at: string;
        }
      >(
        `SELECT p.*, t.id AS t_id, t.name AS t_name, t.starts_on AS t_starts_on, t.ends_on AS t_ends_on,
                t.timezone AS t_timezone, t.created_at AS t_created_at
         FROM participations p JOIN trips t ON t.id = p.trip_id
         WHERE p.account_id = ? ORDER BY t.starts_on DESC`,
        accountId,
      )
      .toArray();
    return rows.map((r) => ({
      trip: this.tripFromRow({
        id: r.t_id,
        name: r.t_name,
        starts_on: r.t_starts_on,
        ends_on: r.t_ends_on,
        timezone: r.t_timezone,
        created_at: r.t_created_at,
      }),
      participation: this.participationFromRow(r),
    }));
  }

  /** Who must acknowledge: travelers and leaders of the trip (D16: guardians never ack). */
  private ackDuty(tripId: string): ParticipationRow[] {
    return this.ctx.storage.sql
      .exec<ParticipationRow>(
        "SELECT * FROM participations WHERE trip_id = ? AND role IN ('traveler', 'leader') ORDER BY group_name, display_name",
        tripId,
      )
      .toArray();
  }

  private announcementFromRow(
    r: AnnouncementRow,
    viewerParticipationId: string | null,
  ): Announcement {
    const ackCount = this.ctx.storage.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM acks WHERE announcement_id = ?', r.id)
      .one().n;
    const ackTotal = this.ctx.storage.sql
      .exec<{ n: number }>(
        "SELECT COUNT(*) AS n FROM participations WHERE trip_id = ? AND role IN ('traveler', 'leader')",
        r.trip_id,
      )
      .one().n;
    const mine = viewerParticipationId
      ? this.ctx.storage.sql
          .exec<{ n: number }>(
            'SELECT COUNT(*) AS n FROM acks WHERE announcement_id = ? AND participation_id = ?',
            r.id,
            viewerParticipationId,
          )
          .one().n
      : 0;
    return {
      id: r.id,
      tripId: r.trip_id,
      title: r.title,
      body: r.body,
      requiresAck: r.requires_ack === 1,
      sharedWithGuardians: r.shared_with_guardians === 1,
      authorName: r.author_name,
      publishedAt: r.published_at,
      ackTotal,
      ackCount,
      myAck: mine > 0 ? 'acknowledged' : 'unacknowledged',
      translation:
        r.translated_body && r.translated_locale && r.translation_provider
          ? {
              locale: r.translated_locale as 'ko' | 'en',
              body: r.translated_body,
              provider: r.translation_provider as 'machine' | 'edited' | 'system',
              editedBy: r.translation_edited_by,
            }
          : null,
      kind: r.kind === 'itinerary_revision' ? 'itinerary_revision' : 'announcement',
      revision:
        r.kind === 'itinerary_revision' && r.revision !== null
          ? this.revisionSummary(r.trip_id, r.revision)
          : null,
    };
  }

  /** The stored diff of a revision, or an empty summary when none was recorded. */
  private revisionSummary(tripId: string, revision: number): RevisionSummary {
    const row = this.ctx.storage.sql
      .exec<RevisionRow>(
        'SELECT * FROM itinerary_revisions WHERE trip_id = ? AND revision = ?',
        tripId,
        revision,
      )
      .toArray()[0];
    const stored = row?.diff
      ? (JSON.parse(row.diff) as Omit<RevisionSummary, 'revision' | 'fromRevision'>)
      : null;
    return {
      revision,
      fromRevision: Math.max(0, revision - 1),
      added: stored?.added ?? 0,
      changed: stored?.changed ?? 0,
      removed: stored?.removed ?? 0,
      changes: stored?.changes ?? [],
    };
  }

  async createAnnouncement(input: {
    tripId: string;
    title: string;
    body: string;
    requiresAck: boolean;
    sharedWithGuardians: boolean;
    authorParticipationId: string | null;
    authorName: string;
    /** Computed by the Worker through the AI port before the row exists; null = none. */
    translation: TranslationInput | null;
    kind?: 'announcement' | 'itinerary_revision';
    revision?: number | null;
  }): Promise<Announcement> {
    this.requireOrg();
    if (!(await this.getTrip(input.tripId))) throw new Error('trip not found');
    const row: AnnouncementRow = {
      id: crypto.randomUUID(),
      trip_id: input.tripId,
      title: input.title,
      body: input.body,
      requires_ack: input.requiresAck ? 1 : 0,
      shared_with_guardians: input.sharedWithGuardians ? 1 : 0,
      author_participation_id: input.authorParticipationId,
      author_name: input.authorName,
      published_at: nowIso(),
      translated_body: input.translation?.body ?? null,
      translated_locale: input.translation?.locale ?? null,
      translation_provider: input.translation?.provider ?? null,
      translation_edited_by: input.translation?.editedBy ?? null,
      kind: input.kind ?? 'announcement',
      revision: input.revision ?? null,
    };
    this.ctx.storage.sql.exec(
      `INSERT INTO announcements
        (id, trip_id, title, body, requires_ack, shared_with_guardians, author_participation_id, author_name, published_at,
         translated_body, translated_locale, translation_provider, translation_edited_by, kind, revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.trip_id,
      row.title,
      row.body,
      row.requires_ack,
      row.shared_with_guardians,
      row.author_participation_id,
      row.author_name,
      row.published_at,
      row.translated_body,
      row.translated_locale,
      row.translation_provider,
      row.translation_edited_by,
      row.kind,
      row.revision,
    );
    return this.announcementFromRow(row, input.authorParticipationId);
  }

  /** Replace or set the translation (a bilingual leader's edit, ADR-0009). Null = not found. */
  async setTranslation(
    tripId: string,
    announcementId: string,
    translation: TranslationInput,
    viewerParticipationId: string | null,
  ): Promise<Announcement | null> {
    this.requireOrg();
    const sql = this.ctx.storage.sql;
    const exists = sql
      .exec<{ id: string }>(
        'SELECT id FROM announcements WHERE id = ? AND trip_id = ?',
        announcementId,
        tripId,
      )
      .toArray()[0];
    if (!exists) return null;
    sql.exec(
      `UPDATE announcements SET translated_body = ?, translated_locale = ?, translation_provider = ?, translation_edited_by = ?
        WHERE id = ?`,
      translation.body,
      translation.locale,
      translation.provider,
      translation.editedBy,
      announcementId,
    );
    const row = sql
      .exec<AnnouncementRow>('SELECT * FROM announcements WHERE id = ?', announcementId)
      .one();
    return this.announcementFromRow(row, viewerParticipationId);
  }

  /**
   * Newest first. Guardians see only `sharedWithGuardians` items (D13); everyone else sees all.
   * `viewer` is the caller's participation (null for an organizer with no participation).
   */
  async listAnnouncements(tripId: string, viewer: Participation | null): Promise<Announcement[]> {
    this.requireOrg();
    const guardian = viewer?.role === 'guardian';
    const rows = this.ctx.storage.sql
      .exec<AnnouncementRow>(
        guardian
          ? 'SELECT * FROM announcements WHERE trip_id = ? AND shared_with_guardians = 1 ORDER BY published_at DESC'
          : 'SELECT * FROM announcements WHERE trip_id = ? ORDER BY published_at DESC',
        tripId,
      )
      .toArray();
    return rows.map((r) => this.announcementFromRow(r, viewer?.id ?? null));
  }

  async getAnnouncement(
    announcementId: string,
    viewer: Participation | null,
  ): Promise<Announcement | null> {
    this.requireOrg();
    const r = this.ctx.storage.sql
      .exec<AnnouncementRow>('SELECT * FROM announcements WHERE id = ?', announcementId)
      .toArray()[0];
    if (!r) return null;
    if (viewer?.role === 'guardian' && r.shared_with_guardians !== 1) return null;
    return this.announcementFromRow(r, viewer?.id ?? null);
  }

  /** Idempotent: the first ack wins and later replays return `created: false` with the stored row. */
  async ack(
    announcementId: string,
    participationId: string,
    ackedAtDevice: string,
  ): Promise<{ created: boolean; ackedAtDevice: string; receivedAt: string }> {
    this.requireOrg();
    const existing = this.ctx.storage.sql
      .exec<{ acked_at_device: string; received_at: string }>(
        'SELECT acked_at_device, received_at FROM acks WHERE announcement_id = ? AND participation_id = ?',
        announcementId,
        participationId,
      )
      .toArray()[0];
    if (existing)
      return {
        created: false,
        ackedAtDevice: existing.acked_at_device,
        receivedAt: existing.received_at,
      };
    const receivedAt = nowIso();
    this.ctx.storage.sql.exec(
      'INSERT INTO acks (announcement_id, participation_id, acked_at_device, received_at) VALUES (?, ?, ?, ?)',
      announcementId,
      participationId,
      ackedAtDevice,
      receivedAt,
    );
    return { created: true, ackedAtDevice, receivedAt };
  }

  /** Leader view: who has and has not acknowledged, among those with ack duty. */
  async ackStatus(announcementId: string): Promise<AckStatus | null> {
    this.requireOrg();
    const a = this.ctx.storage.sql
      .exec<AnnouncementRow>('SELECT * FROM announcements WHERE id = ?', announcementId)
      .toArray()[0];
    if (!a) return null;
    const acks = new Map(
      this.ctx.storage.sql
        .exec<{ participation_id: string; received_at: string }>(
          'SELECT participation_id, received_at FROM acks WHERE announcement_id = ?',
          announcementId,
        )
        .toArray()
        .map((r) => [r.participation_id, r.received_at]),
    );
    const entries = this.ackDuty(a.trip_id).map((p) => ({
      participationId: p.id,
      displayName: p.display_name,
      groupName: p.group_name,
      ackedAt: acks.get(p.id) ?? null,
    }));
    return {
      announcementId,
      acked: entries.filter((e) => e.ackedAt !== null),
      unacked: entries.filter((e) => e.ackedAt === null),
    };
  }

  private headcountFromRow(r: HeadcountRow): HeadcountSession {
    const sql = this.ctx.storage.sql;
    const scope = r.group_name
      ? sql
          .exec<ParticipationRow>(
            "SELECT * FROM participations WHERE trip_id = ? AND role = 'traveler' AND group_name = ? ORDER BY display_name",
            r.trip_id,
            r.group_name,
          )
          .toArray()
      : sql
          .exec<ParticipationRow>(
            "SELECT * FROM participations WHERE trip_id = ? AND role = 'traveler' ORDER BY display_name",
            r.trip_id,
          )
          .toArray();
    const marks = new Map(
      sql
        .exec<{ participation_id: string; mark: string }>(
          'SELECT participation_id, mark FROM headcount_marks WHERE headcount_id = ?',
          r.id,
        )
        .toArray()
        .map((m) => [m.participation_id, m.mark as HeadcountMark]),
    );
    const closed = r.closed_at_device !== null;
    let present = 0;
    let accounted = 0;
    const missing: HeadcountSession['missing'] = [];
    for (const p of scope) {
      const mark = marks.get(p.id);
      if (mark === 'present') {
        present++;
        accounted++;
      } else if (mark === 'with_other_group' || mark === 'excused') {
        accounted++;
      } else if (mark === 'missing' || closed) {
        // Unmarked rows count as missing once the session is closed (D14 close semantics).
        missing.push({
          participationId: p.id,
          displayName: p.display_name,
          groupName: p.group_name,
          mark: 'missing',
        });
      } else {
        missing.push({
          participationId: p.id,
          displayName: p.display_name,
          groupName: p.group_name,
          mark: 'missing',
        });
      }
    }
    return {
      id: r.id,
      tripId: r.trip_id,
      groupName: r.group_name,
      openedByName: r.opened_by_name,
      openedAtDevice: r.opened_at_device,
      closedAtDevice: r.closed_at_device,
      receivedAt: r.received_at,
      expected: scope.length,
      present,
      accounted,
      missing,
      closedWithMissing: closed && missing.length > 0,
    };
  }

  /**
   * Idempotent upsert of a device head count. A session the server already holds closed is
   * never changed (`applied: false`); otherwise marks are replaced wholesale with the device's.
   *
   * Returns `{ conflict: 'other-trip' }` instead of throwing when the id is already used by a
   * different trip: an exception crossing the Durable Object RPC boundary is logged by workerd as
   * an uncaught promise rejection, so expected outcomes travel as values.
   */
  async syncHeadcount(input: {
    id: string;
    tripId: string;
    groupName: string | null;
    openedByParticipationId: string | null;
    openedByName: string;
    openedAtDevice: string;
    closedAtDevice: string | null;
    marks: { participationId: string; mark: HeadcountMark }[];
  }): Promise<
    | {
        session: HeadcountSession;
        applied: boolean;
        incidentId: string | null;
        /** True when this call created the session (slice 052: the head-count call goes out). */
        opened: boolean;
        /** True when this call opened the incident (slice 052: the status goes out). */
        incidentOpened: boolean;
      }
    | { conflict: 'other-trip' }
  > {
    this.requireOrg();
    if (!(await this.getTrip(input.tripId))) throw new Error('trip not found');
    const sql = this.ctx.storage.sql;
    const existing = sql
      .exec<HeadcountRow>('SELECT * FROM headcounts WHERE id = ?', input.id)
      .toArray()[0];
    if (existing) {
      if (existing.trip_id !== input.tripId) return { conflict: 'other-trip' };
      if (existing.closed_at_device !== null) {
        return {
          session: this.headcountFromRow(existing),
          applied: false,
          incidentId: this.incidentForHeadcount(existing.id),
          opened: false,
          incidentOpened: false,
        };
      }
    }
    const validIds = new Set(
      sql
        .exec<{ id: string }>('SELECT id FROM participations WHERE trip_id = ?', input.tripId)
        .toArray()
        .map((r) => r.id),
    );
    const receivedAt = nowIso();
    this.ctx.storage.transactionSync(() => {
      if (existing) {
        sql.exec(
          'UPDATE headcounts SET closed_at_device = ?, received_at = ?, group_name = ? WHERE id = ?',
          input.closedAtDevice,
          receivedAt,
          input.groupName,
          input.id,
        );
        sql.exec('DELETE FROM headcount_marks WHERE headcount_id = ?', input.id);
      } else {
        sql.exec(
          `INSERT INTO headcounts
            (id, trip_id, group_name, opened_by_participation_id, opened_by_name, opened_at_device, closed_at_device, received_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          input.id,
          input.tripId,
          input.groupName,
          input.openedByParticipationId,
          input.openedByName,
          input.openedAtDevice,
          input.closedAtDevice,
          receivedAt,
        );
      }
      for (const m of input.marks) {
        if (!validIds.has(m.participationId)) continue;
        sql.exec(
          'INSERT OR REPLACE INTO headcount_marks (headcount_id, participation_id, mark) VALUES (?, ?, ?)',
          input.id,
          m.participationId,
          m.mark,
        );
      }
    });
    const row = sql.exec<HeadcountRow>('SELECT * FROM headcounts WHERE id = ?', input.id).one();
    const session = this.headcountFromRow(row);
    // D25: a close that leaves travelers missing opens one incident card naming them.
    const hadIncident = this.incidentForHeadcount(session.id) !== null;
    const incidentId = session.closedWithMissing ? this.openHeadcountIncident(session) : null;
    return {
      session,
      applied: true,
      incidentId,
      opened: !existing,
      incidentOpened: incidentId !== null && !hadIncident,
    };
  }

  private incidentForHeadcount(headcountId: string): string | null {
    return (
      this.ctx.storage.sql
        .exec<{ id: string }>('SELECT id FROM incidents WHERE headcount_id = ?', headcountId)
        .toArray()[0]?.id ?? null
    );
  }

  /**
   * Slice 068 (D17): a card the organizer opens by hand, naming travelers of the trip. A guardian,
   * a leader or an unknown id is refused (`notATraveler`); the card is open, kind `manual`
   * (slice 074: `help` when a traveler asked for themselves), without a head count.
   */
  async openManualIncident(input: {
    tripId: string;
    title: string;
    participationIds: string[];
    byName: string;
    now: string;
    kind?: 'manual' | 'help';
  }): Promise<{ incident: Incident } | { notFound: true } | { notATraveler: string }> {
    this.requireOrg();
    if (!(await this.getTrip(input.tripId))) return { notFound: true };
    const roster = await this.listRoster(input.tripId);
    const ids = [...new Set(input.participationIds)];
    for (const id of ids) {
      const p = roster.find((r) => r.id === id);
      if (p?.role !== 'traveler') return { notATraveler: id };
    }
    const sql = this.ctx.storage.sql;
    const id = crypto.randomUUID();
    this.ctx.storage.transactionSync(() => {
      sql.exec(
        `INSERT INTO incidents
          (id, trip_id, kind, status, title, headcount_id, opened_at, opened_by_name)
         VALUES (?, ?, ?, 'open', ?, NULL, ?, ?)`,
        id,
        input.tripId,
        input.kind ?? 'manual',
        input.title,
        input.now,
        input.byName,
      );
      for (const pid of ids) {
        sql.exec(
          'INSERT OR IGNORE INTO incident_people (incident_id, participation_id) VALUES (?, ?)',
          id,
          pid,
        );
      }
    });
    const row = sql.exec<IncidentRow>('SELECT * FROM incidents WHERE id = ?', id).toArray()[0];
    if (!row) return { notFound: true };
    return { incident: this.incidentFromRow(row) };
  }

  /** Idempotent per head count: a second call returns the existing card. */
  private openHeadcountIncident(session: HeadcountSession): string {
    const existing = this.incidentForHeadcount(session.id);
    if (existing) return existing;
    const sql = this.ctx.storage.sql;
    const id = crypto.randomUUID();
    const scope = session.groupName ?? 'Whole trip';
    const n = session.missing.length;
    const title = `Head count closed with ${n} missing (${scope}, ${session.closedAtDevice ?? ''})`;
    this.ctx.storage.transactionSync(() => {
      sql.exec(
        `INSERT INTO incidents
          (id, trip_id, kind, status, title, headcount_id, opened_at, opened_by_name)
         VALUES (?, ?, 'headcount_missing', 'open', ?, ?, ?, ?)`,
        id,
        session.tripId,
        title,
        session.id,
        nowIso(),
        session.openedByName,
      );
      for (const m of session.missing) {
        sql.exec(
          'INSERT OR IGNORE INTO incident_people (incident_id, participation_id) VALUES (?, ?)',
          id,
          m.participationId,
        );
      }
    });
    return id;
  }

  private incidentFromRow(r: IncidentRow): Incident {
    const people = this.ctx.storage.sql
      .exec<{ id: string; display_name: string; group_name: string | null }>(
        `SELECT p.id, p.display_name, p.group_name
           FROM incident_people ip JOIN participations p ON p.id = ip.participation_id
          WHERE ip.incident_id = ? ORDER BY p.display_name`,
        r.id,
      )
      .toArray()
      .map((p) => ({
        participationId: p.id,
        displayName: p.display_name,
        groupName: p.group_name,
      }));
    return {
      id: r.id,
      tripId: r.trip_id,
      kind: r.kind as Incident['kind'],
      status: r.status as Incident['status'],
      title: r.title,
      headcountId: r.headcount_id,
      people,
      openedAt: r.opened_at,
      openedByName: r.opened_by_name,
      resolvedAt: r.resolved_at,
      resolvedByName: r.resolved_by_name,
      resolutionNote: r.resolution_note,
      confirmations: this.ctx.storage.sql
        .exec<ConfirmationRow>(
          'SELECT * FROM incident_confirmations WHERE incident_id = ? ORDER BY confirmed_at DESC',
          r.id,
        )
        .toArray()
        .map((c) => ({
          id: c.id,
          status: c.status as Incident['confirmations'][number]['status'],
          note: c.note,
          confirmedByName: c.by_name,
          confirmedByRole: c.by_role as 'leader' | 'organizer',
          confirmedAt: c.confirmed_at,
        })),
      guardianMessage:
        r.guardian_message_en && r.guardian_message_ko && r.guardian_message_sent_at
          ? {
              bodyEn: r.guardian_message_en,
              bodyKo: r.guardian_message_ko,
              sentAt: r.guardian_message_sent_at,
              sentByName: r.guardian_message_by_name ?? 'Organizer',
            }
          : null,
    };
  }

  /**
   * Guardian projection (visibility matrix): only cards about their own traveler, a generic
   * title, that traveler alone, no confirmation trail and no resolution note; the status
   * message stays.
   */
  private guardianView(i: Incident, travelerId: string): Incident {
    const mine = i.people.filter((p) => p.participationId === travelerId);
    return {
      ...i,
      title: `Status update about ${mine.map((p) => p.displayName).join(', ')}`,
      people: mine,
      confirmations: [],
      resolutionNote: null,
    };
  }

  /**
   * Traveler projection (slice 074): the cards naming them, themselves alone, no resolution
   * note and no guardian message (that one is the guardian's); a card they opened keeps their
   * own words, any other reads as a status update, like the guardian's. Slice 082: the latest
   * answer stays (who and when, the status), its note blanked; the rest of the trail does not.
   */
  private travelerView(i: Incident, travelerId: string): Incident {
    const view = this.guardianView(i, travelerId);
    // Slice 082: the latest answer only, without the leader's note, so the traveler knows
    // someone saw their request and who; the trail and the notes stay with the staff.
    const answered = i.confirmations.slice(0, 1).map((c) => ({ ...c, note: null }));
    return {
      ...view,
      title: i.kind === 'help' ? i.title : view.title,
      guardianMessage: null,
      confirmations: answered,
    };
  }

  /**
   * Open cards first, newest first within a status. A guardian viewer gets only the cards
   * naming their traveler, projected (`guardianView`); a traveler viewer the cards naming
   * themselves, projected (`travelerView`, slice 074); staff get everything.
   */
  async listIncidents(tripId: string, viewer: Participation | null = null): Promise<Incident[]> {
    this.requireOrg();
    const all = this.ctx.storage.sql
      .exec<IncidentRow>(
        `SELECT * FROM incidents WHERE trip_id = ?
          ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, opened_at DESC`,
        tripId,
      )
      .toArray()
      .map((r) => this.incidentFromRow(r));
    if (viewer?.role === 'guardian') {
      const travelerId = viewer.guardianOf;
      if (!travelerId) return [];
      return all
        .filter((i) => i.people.some((p) => p.participationId === travelerId))
        .map((i) => this.guardianView(i, travelerId));
    }
    if (viewer?.role === 'traveler') {
      const me = viewer.id;
      return all
        .filter((i) => i.people.some((p) => p.participationId === me))
        .map((i) => this.travelerView(i, me));
    }
    return all;
  }

  /** A leader's (or organizer's) answer on an open card. Resolved cards take no more answers. */
  async confirmIncident(input: {
    tripId: string;
    incidentId: string;
    status: 'with_group' | 'not_with_group' | 'unknown';
    note: string | null;
    byParticipationId: string | null;
    byName: string;
    byRole: 'leader' | 'organizer';
  }): Promise<{ incident: Incident } | { notFound: true } | { resolved: true }> {
    this.requireOrg();
    const sql = this.ctx.storage.sql;
    const row = sql
      .exec<IncidentRow>(
        'SELECT * FROM incidents WHERE id = ? AND trip_id = ?',
        input.incidentId,
        input.tripId,
      )
      .toArray()[0];
    if (!row) return { notFound: true };
    if (row.status === 'resolved') return { resolved: true };
    sql.exec(
      `INSERT INTO incident_confirmations
        (id, incident_id, status, note, by_participation_id, by_name, by_role, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      input.incidentId,
      input.status,
      input.note,
      input.byParticipationId,
      input.byName,
      input.byRole,
      nowIso(),
    );
    return { incident: this.incidentFromRow(row) };
  }

  /**
   * Compose and store the guardian status message from the latest confirmation (D17). Sending
   * again replaces the message (a newer confirmation, a correction). Delivery to guardian
   * devices rides the push lane of a later slice; guardians can already read it on list.
   */
  async sendGuardianMessage(input: {
    tripId: string;
    incidentId: string;
    byName: string;
  }): Promise<{ incident: Incident } | { notFound: true } | { noConfirmation: true }> {
    this.requireOrg();
    const sql = this.ctx.storage.sql;
    const row = sql
      .exec<IncidentRow>(
        'SELECT * FROM incidents WHERE id = ? AND trip_id = ?',
        input.incidentId,
        input.tripId,
      )
      .toArray()[0];
    if (!row) return { notFound: true };
    const incident = this.incidentFromRow(row);
    const latest = incident.confirmations[0];
    if (!latest) return { noConfirmation: true };
    const trip = await this.getTrip(input.tripId);
    const body = composeGuardianMessage({
      names: incident.people.map((p) => p.displayName),
      status: latest.status,
      note: latest.note,
      byName: latest.confirmedByName,
      byRole: latest.confirmedByRole,
      clock: localClock(latest.confirmedAt, trip?.timezone ?? 'UTC'),
    });
    sql.exec(
      `UPDATE incidents SET guardian_message_en = ?, guardian_message_ko = ?, guardian_message_sent_at = ?, guardian_message_by_name = ?
        WHERE id = ?`,
      body.en,
      body.ko,
      nowIso(),
      input.byName,
      input.incidentId,
    );
    const updated = sql
      .exec<IncidentRow>('SELECT * FROM incidents WHERE id = ?', input.incidentId)
      .one();
    return { incident: this.incidentFromRow(updated) };
  }

  /**
   * Resolve a card. Returns the card, `{ notFound: true }` when the id is not on this trip, or
   * `{ alreadyResolved: Incident }` so a double click is reported, not treated as an error.
   */
  async resolveIncident(input: {
    tripId: string;
    incidentId: string;
    byName: string;
    note: string | null;
  }): Promise<{ incident: Incident } | { notFound: true } | { alreadyResolved: Incident }> {
    this.requireOrg();
    const sql = this.ctx.storage.sql;
    const row = sql
      .exec<IncidentRow>(
        'SELECT * FROM incidents WHERE id = ? AND trip_id = ?',
        input.incidentId,
        input.tripId,
      )
      .toArray()[0];
    if (!row) return { notFound: true };
    if (row.status === 'resolved') return { alreadyResolved: this.incidentFromRow(row) };
    sql.exec(
      `UPDATE incidents SET status = 'resolved', resolved_at = ?, resolved_by_name = ?, resolution_note = ?
        WHERE id = ?`,
      nowIso(),
      input.byName,
      input.note,
      input.incidentId,
    );
    const updated = sql
      .exec<IncidentRow>('SELECT * FROM incidents WHERE id = ?', input.incidentId)
      .one();
    return { incident: this.incidentFromRow(updated) };
  }

  async listHeadcounts(tripId: string): Promise<HeadcountSession[]> {
    this.requireOrg();
    return this.ctx.storage.sql
      .exec<HeadcountRow>(
        'SELECT * FROM headcounts WHERE trip_id = ? ORDER BY received_at DESC',
        tripId,
      )
      .toArray()
      .map((r) => this.headcountFromRow(r));
  }

  /* ---------- Guardian status (slice 025, D13) ---------- */

  /**
   * What a guardian may know about their traveler: the mark on the latest head count that covered
   * the traveler's group (or the whole trip), the latest incident naming the traveler with its
   * guardian message, and the published revision. Null when the participation is not a guardian
   * bound to a traveler. Never coordinates, never other travelers' names.
   */
  async guardianStatus(
    tripId: string,
    guardianParticipationId: string,
  ): Promise<GuardianStatus | null> {
    this.requireOrg();
    const guardian = await this.getParticipation(guardianParticipationId);
    if (
      !guardian ||
      guardian.tripId !== tripId ||
      guardian.role !== 'guardian' ||
      !guardian.guardianOf
    ) {
      return null;
    }
    const traveler = await this.getParticipation(guardian.guardianOf);
    if (!traveler) return null;
    const sql = this.ctx.storage.sql;
    const h = sql
      .exec<{
        id: string;
        group_name: string | null;
        opened_by_name: string;
        opened_at_device: string;
        closed_at_device: string | null;
        received_at: string;
        mark: string | null;
      }>(
        `SELECT h.id, h.group_name, h.opened_by_name, h.opened_at_device, h.closed_at_device, h.received_at, m.mark
         FROM headcounts h LEFT JOIN headcount_marks m ON m.headcount_id = h.id AND m.participation_id = ?
         WHERE h.trip_id = ? AND (h.group_name IS NULL OR h.group_name = ?)
         ORDER BY h.received_at DESC LIMIT 1`,
        traveler.id,
        tripId,
        traveler.groupName ?? '',
      )
      .toArray()[0];
    const MARKS: Record<string, TravelerCountStatus> = {
      present: 'present',
      missing: 'missing',
      with_other_group: 'with_other_group',
      excused: 'excused',
    };
    // No mark yet: an open count has not reached the traveler; a closed one counted them missing.
    const status: TravelerCountStatus = !h
      ? 'not_counted'
      : (h.mark && MARKS[h.mark]) || (h.closed_at_device ? 'missing' : 'not_counted');
    const i = sql
      .exec<IncidentRow>(
        `SELECT i.* FROM incidents i JOIN incident_people p ON p.incident_id = i.id
         WHERE i.trip_id = ? AND p.participation_id = ? ORDER BY i.opened_at DESC LIMIT 1`,
        tripId,
        traveler.id,
      )
      .toArray()[0];
    return {
      traveler: {
        participationId: traveler.id,
        displayName: traveler.displayName,
        groupName: traveler.groupName,
      },
      count: {
        status,
        headcountId: h?.id ?? null,
        groupLabel: h ? h.group_name : null,
        closed: Boolean(h?.closed_at_device),
        atDevice: h ? (h.closed_at_device ?? h.opened_at_device) : null,
        byName: h?.opened_by_name ?? null,
        receivedAt: h?.received_at ?? null,
      },
      incident: i
        ? {
            id: i.id,
            status: i.status as IncidentStatus,
            kind: i.kind as Incident['kind'],
            openedAt: i.opened_at,
            message:
              i.guardian_message_en && i.guardian_message_ko && i.guardian_message_sent_at
                ? {
                    bodyEn: i.guardian_message_en,
                    bodyKo: i.guardian_message_ko,
                    sentAt: i.guardian_message_sent_at,
                    sentByName: i.guardian_message_by_name ?? 'Organizer',
                  }
                : null,
          }
        : null,
      itineraryRevision: this.latestRevision(tripId)?.revision ?? 0,
      fee: this.feeForTraveler(traveler.id),
    };
  }

  /* ---------- Meeting windows (slice 029, D15) ---------- */

  /** Lazy auto-stop: a window past its end is closed and its meeting point erased (D15). */
  private autoStopWindows(tripId: string, now: string): void {
    this.ctx.storage.sql.exec(
      'UPDATE meeting_windows SET closed_at = ends_at, center_lat = NULL, center_lng = NULL WHERE trip_id = ? AND closed_at IS NULL AND ends_at <= ?',
      tripId,
      now,
    );
  }

  private windowFromRow(
    r: WindowRow,
    viewer: { staff: boolean; participationId: string | null },
    now: string,
  ): MeetingWindow {
    const status = windowStatusOf(r.starts_at, r.ends_at, r.closed_at, now);
    const rows = this.ctx.storage.sql
      .exec<WindowMemberRow>(
        `SELECT m.participation_id, m.state, m.reported_at, p.display_name, p.group_name
         FROM meeting_window_members m JOIN participations p ON p.id = m.participation_id
         WHERE m.window_id = ? ORDER BY p.group_name, p.display_name`,
        r.id,
      )
      .toArray();
    const stale = (m: WindowMemberRow): boolean =>
      status === 'open' &&
      m.state !== 'opted_out' &&
      (m.reported_at === null || Date.parse(now) - Date.parse(m.reported_at) > WINDOW_STALE_MS);
    const members: WindowMember[] = rows.map((m) => ({
      participationId: m.participation_id,
      displayName: m.display_name,
      groupName: m.group_name,
      state: stale(m) ? 'stale' : (m.state as WindowMemberState),
      reportedAt: m.reported_at,
    }));
    const count = (state: WindowMemberState) => members.filter((m) => m.state === state).length;
    const isMember = members.some((m) => m.participationId === viewer.participationId);
    return {
      id: r.id,
      tripId: r.trip_id,
      label: r.label,
      place: r.place,
      radiusMeters: r.radius_m,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      groups: JSON.parse(r.group_names) as string[],
      openedByName: r.opened_by_name,
      openedAt: r.opened_at,
      closedAt: r.closed_at,
      status,
      center:
        status === 'open' &&
        (viewer.staff || isMember) &&
        r.center_lat !== null &&
        r.center_lng !== null
          ? { lat: r.center_lat, lng: r.center_lng }
          : null,
      members: viewer.staff
        ? members
        : members.filter((m) => m.participationId === viewer.participationId),
      counts: {
        inside: count('inside'),
        outside: count('outside'),
        uncertain: count('uncertain'),
        stale: count('stale'),
        optedOut: count('opted_out'),
        total: members.length,
      },
    };
  }

  /** Open a window for the travelers of the given groups (every traveler when none). */
  async openWindow(
    tripId: string,
    input: OpenWindowRequest,
    openedBy: { participationId: string | null; name: string },
    now: string,
  ): Promise<MeetingWindow | { invalid: string }> {
    this.requireOrg();
    if (input.endsAt <= input.startsAt) return { invalid: 'endsAt must be after startsAt.' };
    if (input.endsAt <= now) return { invalid: 'The window would already be over.' };
    const sql = this.ctx.storage.sql;
    const id = crypto.randomUUID();
    const travelers = sql
      .exec<ParticipationRow>(
        "SELECT * FROM participations WHERE trip_id = ? AND role = 'traveler'",
        tripId,
      )
      .toArray()
      .filter(
        (t) =>
          input.groups.length === 0 ||
          (t.group_name !== null && input.groups.includes(t.group_name)),
      );
    this.ctx.storage.transactionSync(() => {
      sql.exec(
        `INSERT INTO meeting_windows (id, trip_id, label, place, radius_m, starts_at, ends_at, group_names, opened_by_participation_id, opened_by_name, opened_at, closed_at, center_lat, center_lng)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        id,
        tripId,
        input.label,
        input.place,
        input.radiusMeters,
        input.startsAt,
        input.endsAt,
        JSON.stringify(input.groups),
        openedBy.participationId,
        openedBy.name,
        now,
        input.center.lat,
        input.center.lng,
      );
      for (const t of travelers) {
        sql.exec(
          "INSERT INTO meeting_window_members (window_id, participation_id, state, reported_at) VALUES (?, ?, 'opted_out', NULL)",
          id,
          t.id,
        );
      }
    });
    const row = sql
      .exec<WindowRow>('SELECT * FROM meeting_windows WHERE id = ?', id)
      .toArray()[0] as WindowRow;
    return this.windowFromRow(row, { staff: true, participationId: null }, now);
  }

  /** Windows of a trip, newest first (at most 20), after the lazy auto-stop. */
  async listWindows(
    tripId: string,
    viewer: { staff: boolean; participationId: string | null },
    now: string,
  ): Promise<MeetingWindow[]> {
    this.requireOrg();
    this.autoStopWindows(tripId, now);
    return this.ctx.storage.sql
      .exec<WindowRow>(
        'SELECT * FROM meeting_windows WHERE trip_id = ? ORDER BY opened_at DESC LIMIT 20',
        tripId,
      )
      .toArray()
      .map((r) => this.windowFromRow(r, viewer, now));
  }

  /** Close a window early; the meeting point is erased with it. */
  async closeWindow(
    tripId: string,
    windowId: string,
    now: string,
  ): Promise<MeetingWindow | { notFound: true }> {
    this.requireOrg();
    const sql = this.ctx.storage.sql;
    const row = sql
      .exec<WindowRow>(
        'SELECT * FROM meeting_windows WHERE id = ? AND trip_id = ?',
        windowId,
        tripId,
      )
      .toArray()[0];
    if (!row) return { notFound: true };
    if (!row.closed_at) {
      sql.exec(
        'UPDATE meeting_windows SET closed_at = ?, center_lat = NULL, center_lng = NULL WHERE id = ?',
        now,
        windowId,
      );
    }
    const after = sql
      .exec<WindowRow>('SELECT * FROM meeting_windows WHERE id = ?', windowId)
      .toArray()[0] as WindowRow;
    return this.windowFromRow(after, { staff: true, participationId: null }, now);
  }

  /** A member's own report: a state the device judged, never a position. */
  async reportWindowState(
    tripId: string,
    windowId: string,
    participationId: string,
    state: ReportedWindowState,
    now: string,
  ): Promise<
    | {
        state: WindowMemberState;
        reportedAt: string | null;
        windowStatus: 'scheduled' | 'open' | 'closed';
      }
    | { notFound: true }
    | { notMember: true }
    | { closed: true }
  > {
    this.requireOrg();
    this.autoStopWindows(tripId, now);
    const sql = this.ctx.storage.sql;
    const row = sql
      .exec<WindowRow>(
        'SELECT * FROM meeting_windows WHERE id = ? AND trip_id = ?',
        windowId,
        tripId,
      )
      .toArray()[0];
    if (!row) return { notFound: true };
    const member = sql
      .exec<{ participation_id: string }>(
        'SELECT participation_id FROM meeting_window_members WHERE window_id = ? AND participation_id = ?',
        windowId,
        participationId,
      )
      .toArray()[0];
    if (!member) return { notMember: true };
    const status = windowStatusOf(row.starts_at, row.ends_at, row.closed_at, now);
    if (status === 'closed') return { closed: true };
    const reportedAt = state === 'opted_out' ? null : now;
    sql.exec(
      'UPDATE meeting_window_members SET state = ?, reported_at = ? WHERE window_id = ? AND participation_id = ?',
      state,
      reportedAt,
      windowId,
      participationId,
    );
    return { state, reportedAt, windowStatus: status };
  }

  /* ---------- Fee ledger (slice 027, D23) ---------- */

  private feeRowFromRow(r: FeeRowRecord): FeeRow {
    return {
      participationId: r.participation_id,
      displayName: r.display_name,
      groupName: r.group_name,
      currency: r.currency as Currency,
      amountDueMinor: r.amount_due_minor,
      paidMinor: r.paid_minor,
      refundedMinor: r.refunded_minor,
      dueOn: r.due_on,
      note: r.note,
      status: feeStatusOf(r.amount_due_minor, r.paid_minor, r.refunded_minor),
      updatedAt: r.updated_at,
      updatedByName: r.updated_by_name,
    };
  }

  /** The ledger: every traveler with a fee row, grouped like the roster, with totals. */
  async listFees(tripId: string): Promise<FeeLedger> {
    this.requireOrg();
    const sql = this.ctx.storage.sql;
    const rows = sql
      .exec<FeeRowRecord>(
        `SELECT f.*, p.display_name, p.group_name FROM fees f JOIN participations p ON p.id = f.participation_id
         WHERE f.trip_id = ? ORDER BY p.group_name, p.display_name`,
        tripId,
      )
      .toArray()
      .map((r) => this.feeRowFromRow(r));
    const travelers = sql
      .exec<{ n: number }>(
        "SELECT COUNT(*) AS n FROM participations WHERE trip_id = ? AND role = 'traveler'",
        tripId,
      )
      .toArray()[0]?.n;
    const count = (status: FeeRow['status']) => rows.filter((r) => r.status === status).length;
    return {
      currency: rows[0]?.currency ?? 'KRW',
      rows,
      withoutFee: Math.max(0, (travelers ?? 0) - rows.length),
      totals: {
        expectedMinor: rows.reduce((n, r) => n + r.amountDueMinor, 0),
        collectedMinor: rows.reduce((n, r) => n + Math.max(0, r.paidMinor - r.refundedMinor), 0),
        refundedMinor: rows.reduce((n, r) => n + r.refundedMinor, 0),
        paid: count('paid'),
        partial: count('partial'),
        unpaid: count('unpaid'),
        refunded: count('refunded'),
      },
    };
  }

  /** Set the fee for every traveler (only those without a row unless told otherwise); paid amounts stay. */
  async applyFee(tripId: string, input: ApplyFeeRequest, byName: string): Promise<FeeLedger> {
    this.requireOrg();
    const sql = this.ctx.storage.sql;
    const now = nowIso();
    const travelers = sql
      .exec<{ id: string }>(
        "SELECT id FROM participations WHERE trip_id = ? AND role = 'traveler'",
        tripId,
      )
      .toArray();
    this.ctx.storage.transactionSync(() => {
      for (const t of travelers) {
        const existing = sql
          .exec<{ participation_id: string }>(
            'SELECT participation_id FROM fees WHERE participation_id = ?',
            t.id,
          )
          .toArray()[0];
        if (existing) {
          if (input.onlyWithoutFee) continue;
          sql.exec(
            'UPDATE fees SET currency = ?, amount_due_minor = ?, due_on = ?, updated_at = ?, updated_by_name = ? WHERE participation_id = ?',
            input.currency,
            input.amountDueMinor,
            input.dueOn,
            now,
            byName,
            t.id,
          );
        } else {
          sql.exec(
            'INSERT INTO fees (participation_id, trip_id, currency, amount_due_minor, paid_minor, refunded_minor, due_on, note, updated_at, updated_by_name) VALUES (?, ?, ?, ?, 0, 0, ?, NULL, ?, ?)',
            t.id,
            tripId,
            input.currency,
            input.amountDueMinor,
            input.dueOn,
            now,
            byName,
          );
        }
      }
    });
    return this.listFees(tripId);
  }

  /** Change one traveler's row; a traveler without a row gets one (amount due defaults to 0). */
  async updateFee(
    tripId: string,
    participationId: string,
    patch: UpdateFeeRequest,
    byName: string,
  ): Promise<FeeRow | { notFound: true }> {
    this.requireOrg();
    const sql = this.ctx.storage.sql;
    const traveler = sql
      .exec<ParticipationRow>(
        "SELECT * FROM participations WHERE id = ? AND trip_id = ? AND role = 'traveler'",
        participationId,
        tripId,
      )
      .toArray()[0];
    if (!traveler) return { notFound: true };
    const now = nowIso();
    const current = sql
      .exec<FeeRowRecord>(
        'SELECT f.*, p.display_name, p.group_name FROM fees f JOIN participations p ON p.id = f.participation_id WHERE f.participation_id = ?',
        participationId,
      )
      .toArray()[0];
    const ledgerCurrency =
      sql
        .exec<{ currency: string }>('SELECT currency FROM fees WHERE trip_id = ? LIMIT 1', tripId)
        .toArray()[0]?.currency ?? 'KRW';
    const next = {
      currency: current?.currency ?? ledgerCurrency,
      amount_due_minor: patch.amountDueMinor ?? current?.amount_due_minor ?? 0,
      paid_minor: patch.paidMinor ?? current?.paid_minor ?? 0,
      refunded_minor: patch.refundedMinor ?? current?.refunded_minor ?? 0,
      due_on: patch.dueOn === undefined ? (current?.due_on ?? null) : patch.dueOn,
      note: patch.note === undefined ? (current?.note ?? null) : patch.note,
    };
    sql.exec(
      `INSERT INTO fees (participation_id, trip_id, currency, amount_due_minor, paid_minor, refunded_minor, due_on, note, updated_at, updated_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(participation_id) DO UPDATE SET currency = excluded.currency, amount_due_minor = excluded.amount_due_minor,
         paid_minor = excluded.paid_minor, refunded_minor = excluded.refunded_minor, due_on = excluded.due_on, note = excluded.note,
         updated_at = excluded.updated_at, updated_by_name = excluded.updated_by_name`,
      participationId,
      tripId,
      next.currency,
      next.amount_due_minor,
      next.paid_minor,
      next.refunded_minor,
      next.due_on,
      next.note,
      now,
      byName,
    );
    const row = sql
      .exec<FeeRowRecord>(
        'SELECT f.*, p.display_name, p.group_name FROM fees f JOIN participations p ON p.id = f.participation_id WHERE f.participation_id = ?',
        participationId,
      )
      .toArray()[0];
    return this.feeRowFromRow(row as FeeRowRecord);
  }

  /**
   * Bank export rows matched to travelers by roster name (case and spaces ignored). `paidMinor`
   * is the total paid so far (idempotent). Unmatched names are returned, never guessed.
   */
  async importPayments(
    tripId: string,
    entries: { name: string; paidMinor: number; note: string | null }[],
    byName: string,
  ): Promise<{ applied: number; unmatched: string[] }> {
    this.requireOrg();
    const travelers = this.ctx.storage.sql
      .exec<ParticipationRow>(
        "SELECT * FROM participations WHERE trip_id = ? AND role = 'traveler'",
        tripId,
      )
      .toArray();
    const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
    const byKey = new Map(travelers.map((t) => [key(t.display_name), t.id]));
    const unmatched: string[] = [];
    let applied = 0;
    for (const e of entries) {
      const id = byKey.get(key(e.name));
      if (!id) {
        unmatched.push(e.name);
        continue;
      }
      const patch: UpdateFeeRequest = { paidMinor: e.paidMinor };
      if (e.note !== null) patch.note = e.note;
      await this.updateFee(tripId, id, patch, byName);
      applied += 1;
    }
    return { applied, unmatched };
  }

  /** The guardian's view of their traveler's fee (D23); null until a row exists. */
  private feeForTraveler(participationId: string): GuardianFee | null {
    const r = this.ctx.storage.sql
      .exec<FeeRowRecord>(
        'SELECT f.*, p.display_name, p.group_name FROM fees f JOIN participations p ON p.id = f.participation_id WHERE f.participation_id = ?',
        participationId,
      )
      .toArray()[0];
    if (!r) return null;
    return {
      currency: r.currency as Currency,
      amountDueMinor: r.amount_due_minor,
      paidMinor: r.paid_minor,
      refundedMinor: r.refunded_minor,
      balanceMinor: Math.max(0, r.amount_due_minor - r.paid_minor + r.refunded_minor),
      dueOn: r.due_on,
      status: feeStatusOf(r.amount_due_minor, r.paid_minor, r.refunded_minor),
    };
  }

  /* ---------- Person timeline (slice 026, D17) ---------- */

  /**
   * Every recorded fact about one participation, newest first, capped at 200: acknowledgments
   * (with the announcement title), head counts that covered a traveler (with their mark) or that
   * a leader opened, incidents naming the person (open, resolve, guardian message), and
   * confirmations a leader gave. The join entry comes from D1 (invite codes) in the route.
   */
  // ---- Chat (D22, slice 033) --------------------------------------------------------------

  private chatMessageOf(r: ChatMessageRow, viewer: ChatViewer): ChatMessage {
    return {
      id: r.id,
      channelId: r.channel,
      senderName: r.sender_name,
      senderRole: r.sender_role as ChatSenderRole,
      body: r.removed_at ? '' : r.body,
      sentAt: r.sent_at,
      mine: r.sender_key === viewer.readerKey,
      ...(r.removed_at ? { removed: { byName: r.removed_by_name ?? '', at: r.removed_at } } : {}),
    };
  }

  /** The channel's card for one viewer: title, who is in it, unread, the latest message. */
  private chatChannelCard(
    tripId: string,
    id: string,
    kind: ChatChannelKind,
    title: string,
    subtitle: string,
    viewer: ChatViewer,
  ): ChatChannel {
    const sql = this.ctx.storage.sql;
    const last = sql
      .exec<ChatMessageRow>(
        'SELECT * FROM chat_messages WHERE trip_id = ? AND channel = ? ORDER BY sent_at DESC, id DESC LIMIT 1',
        tripId,
        id,
      )
      .toArray()[0];
    const read = sql
      .exec<{ last_read_at: string }>(
        'SELECT last_read_at FROM chat_reads WHERE trip_id = ? AND channel = ? AND reader_key = ?',
        tripId,
        id,
        viewer.readerKey,
      )
      .toArray()[0];
    const unread = sql
      .exec<{ n: number }>(
        'SELECT COUNT(*) AS n FROM chat_messages WHERE trip_id = ? AND channel = ? AND sender_key <> ? AND sent_at > ?',
        tripId,
        id,
        viewer.readerKey,
        read?.last_read_at ?? '',
      )
      .one().n;
    return {
      id,
      kind,
      title,
      subtitle,
      unread,
      lastMessage: last ? this.chatMessageOf(last, viewer) : null,
    };
  }

  /** The viewer's channels in the D22 matrix, derived from the roster; nothing is created. */
  async chatChannels(tripId: string, viewer: ChatViewer): Promise<ChatChannel[]> {
    this.requireOrg();
    const roster = await this.listRoster(tripId);
    const me = viewer.participation;
    const travelers = (g: string | null) =>
      roster.filter((p) => p.role === 'traveler' && (g === null || p.groupName === g));
    const leadersOf = (g: string | null) =>
      roster.filter((p) => p.role === 'leader' && (p.groupName === null || p.groupName === g));
    const names = (ps: Participation[]) => ps.map((p) => p.displayName).join(', ');
    const w = chatWords(viewer.locale);
    const out: ChatChannel[] = [];
    const tripCard = () =>
      this.chatChannelCard(
        tripId,
        channelIdFor('trip'),
        'trip',
        w.tripTitle,
        w.tripSubtitle(travelers(null).length, roster.filter((p) => p.role === 'leader').length),
        viewer,
      );
    const groupCard = (g: string) =>
      this.chatChannelCard(
        tripId,
        channelIdFor('group', g),
        'group',
        g,
        w.groupSubtitle(travelers(g).length, leadersOf(g).length),
        viewer,
      );
    const travelerCard = (t: Participation, mine: boolean) =>
      this.chatChannelCard(
        tripId,
        channelIdFor('traveler', t.id),
        'traveler',
        mine ? w.yourLeaders : t.displayName,
        mine
          ? w.withLeaders(names(leadersOf(t.groupName)))
          : w.travelerSubtitle(t.displayName, t.groupName),
        viewer,
      );
    const guardianCard = (g: Participation, mine: boolean) => {
      const traveler = roster.find((p) => p.id === g.guardianOf);
      return this.chatChannelCard(
        tripId,
        channelIdFor('guardian', g.id),
        'guardian',
        mine ? w.theOrganizer : g.displayName,
        mine ? w.withOrganizer : w.guardianOf(traveler?.displayName ?? null),
        viewer,
      );
    };
    if (viewer.organizer && !me) {
      out.push(tripCard());
      for (const g of roster.filter((p) => p.role === 'guardian')) out.push(guardianCard(g, false));
      return out;
    }
    if (!me) return out;
    if (me.role === 'guardian') {
      out.push(guardianCard(me, true));
      return out;
    }
    out.push(tripCard());
    const groups = [
      ...new Set(roster.map((p) => p.groupName).filter((g): g is string => g !== null)),
    ];
    if (me.role === 'leader') {
      for (const g of groups)
        if (me.groupName === null || me.groupName === g) out.push(groupCard(g));
      for (const t of travelers(me.groupName)) out.push(travelerCard(t, false));
    } else if (me.role === 'traveler') {
      if (me.groupName) out.push(groupCard(me.groupName));
      out.push(travelerCard(me, true));
    }
    return out;
  }

  /**
   * Slice 065 (D22): remove a message. The sender may remove their own; a leader any message in
   * a group or traveler channel they are in; an owner or organizer any in the trip and guardian
   * channels (`canRemoveChatMessage`). The row stays as a tombstone (who, when) with its text
   * gone, so the thread keeps its shape and the removal is visible to everyone in it. Removing a
   * removed message answers the same tombstone.
   */
  async removeChatMessage(
    tripId: string,
    channelId: string,
    messageId: string,
    viewer: ChatViewer,
    now: string,
  ): Promise<ChatMessage | { forbidden: true } | { notFound: true }> {
    this.requireOrg();
    const access = await this.chatAccess(tripId, channelId, viewer, 'write');
    if (!('ok' in access)) return access;
    const sql = this.ctx.storage.sql;
    const row = sql
      .exec<ChatMessageRow>(
        'SELECT * FROM chat_messages WHERE id = ? AND trip_id = ? AND channel = ?',
        messageId,
        tripId,
        channelId,
      )
      .toArray()[0];
    if (!row) return { notFound: true };
    if (!canRemoveChatMessage(access.card.kind, viewer.role, row.sender_key === viewer.readerKey)) {
      return { forbidden: true };
    }
    if (row.removed_at) return this.chatMessageOf(row, viewer);
    sql.exec(
      "UPDATE chat_messages SET body = '', removed_at = ?, removed_by_name = ? WHERE id = ?",
      now,
      viewer.name,
      messageId,
    );
    return this.chatMessageOf(
      { ...row, body: '', removed_at: now, removed_by_name: viewer.name },
      viewer,
    );
  }

  /**
   * May this viewer read (or write) the channel; the channel's card when so. Slice 064 (D22): an
   * organizer without a participation may read, never write, a group or traveler channel while
   * an open incident names a traveler who is in it; such a read comes back with the incident so
   * the caller records it.
   */
  private async chatAccess(
    tripId: string,
    channelId: string,
    viewer: ChatViewer,
    mode: 'read' | 'write' = 'read',
  ): Promise<
    | { ok: true; card: ChatChannel; audited: Incident | null; travelerIds: string[] }
    | { forbidden: true }
    | { notFound: true }
  > {
    const parsed = parseChannelId(channelId);
    if (!parsed) return { notFound: true };
    const roster = await this.listRoster(tripId);
    const who = channelMembersOf(parsed, roster);
    if (!who.exists) return { notFound: true };
    const me = viewer.participation;
    const travelerIds = roster
      .filter((p) => p.role === 'traveler' && who.members.has(p.id))
      .map((p) => p.id);
    const allowed = (me && who.members.has(me.id)) || (viewer.organizer && !me && who.organizers);
    if (allowed) {
      const card = (await this.chatChannels(tripId, viewer)).find((c) => c.id === channelId);
      if (!card) return { forbidden: true };
      return { ok: true, card, audited: null, travelerIds };
    }
    const onIncident =
      mode === 'read' &&
      viewer.organizer &&
      !me &&
      (parsed.kind === 'group' || parsed.kind === 'traveler');
    if (!onIncident) return { forbidden: true };
    const incident = (await this.listIncidents(tripId)).find(
      (i) => i.status === 'open' && i.people.some((p) => travelerIds.includes(p.participationId)),
    );
    if (!incident) return { forbidden: true };
    const w = chatWords(viewer.locale);
    const travelers = roster.filter((p) => p.role === 'traveler' && who.members.has(p.id));
    const leaders = roster.filter((p) => p.role === 'leader' && who.members.has(p.id));
    const subject = parsed.kind === 'traveler' ? roster.find((p) => p.id === parsed.key) : null;
    const card = await this.chatChannelCard(
      tripId,
      channelId,
      parsed.kind,
      parsed.kind === 'group' ? parsed.key : (subject?.displayName ?? parsed.key),
      parsed.kind === 'group'
        ? w.groupSubtitle(travelers.length, leaders.length)
        : w.travelerSubtitle(subject?.displayName ?? '', subject?.groupName ?? null),
      viewer,
    );
    return { ok: true, card, audited: incident, travelerIds };
  }

  /** The latest 200 messages, oldest first; opening a channel marks it read for this viewer. */
  async chatMessages(
    tripId: string,
    channelId: string,
    viewer: ChatViewer,
    now: string,
  ): Promise<ChatMessageList | { forbidden: true } | { notFound: true }> {
    this.requireOrg();
    const access = await this.chatAccess(tripId, channelId, viewer);
    if (!('ok' in access)) return access;
    const sql = this.ctx.storage.sql;
    const rows = sql
      .exec<ChatMessageRow>(
        'SELECT * FROM chat_messages WHERE trip_id = ? AND channel = ? ORDER BY sent_at DESC, id DESC LIMIT 200',
        tripId,
        channelId,
      )
      .toArray()
      .reverse();
    if (access.audited) {
      // Slice 064 (D22): the organizer is not a member; the read is a fact on every traveler's
      // timeline in the channel, naming the channel and the incident that allowed it.
      const detail = JSON.stringify({
        channel: channelId,
        title: access.card.title,
        incidentId: access.audited.id,
        incidentTitle: access.audited.title,
      });
      for (const participationId of access.travelerIds) {
        sql.exec(
          'INSERT INTO participation_events (id, participation_id, trip_id, kind, by_name, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          crypto.randomUUID(),
          participationId,
          tripId,
          'chat_audited_read',
          viewer.name,
          detail,
          now,
        );
      }
      return {
        channel: { ...access.card, unread: 0 },
        messages: rows.map((r) => this.chatMessageOf(r, viewer)),
        audited: { incidentId: access.audited.id, incidentTitle: access.audited.title },
      };
    }
    sql.exec(
      `INSERT INTO chat_reads (trip_id, channel, reader_key, last_read_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(trip_id, channel, reader_key) DO UPDATE SET last_read_at = excluded.last_read_at`,
      tripId,
      channelId,
      viewer.readerKey,
      now,
    );
    return {
      channel: { ...access.card, unread: 0 },
      messages: rows.map((r) => this.chatMessageOf(r, viewer)),
    };
  }

  async sendChatMessage(
    tripId: string,
    channelId: string,
    viewer: ChatViewer,
    body: string,
    now: string,
  ): Promise<ChatMessage | { forbidden: true } | { notFound: true }> {
    this.requireOrg();
    const access = await this.chatAccess(tripId, channelId, viewer, 'write');
    if (!('ok' in access)) return access;
    const row: ChatMessageRow = {
      id: crypto.randomUUID(),
      trip_id: tripId,
      channel: channelId,
      sender_key: viewer.readerKey,
      sender_name: viewer.name,
      sender_role: viewer.role,
      body: body.trim(),
      sent_at: now,
      removed_at: null,
      removed_by_name: null,
    };
    const sql = this.ctx.storage.sql;
    sql.exec(
      'INSERT INTO chat_messages (id, trip_id, channel, sender_key, sender_name, sender_role, body, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      row.id,
      row.trip_id,
      row.channel,
      row.sender_key,
      row.sender_name,
      row.sender_role,
      row.body,
      row.sent_at,
    );
    // Sending reads the channel up to now for the sender.
    sql.exec(
      `INSERT INTO chat_reads (trip_id, channel, reader_key, last_read_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(trip_id, channel, reader_key) DO UPDATE SET last_read_at = excluded.last_read_at`,
      tripId,
      channelId,
      viewer.readerKey,
      now,
    );
    return this.chatMessageOf(row, viewer);
  }

  // ---- Care notes (D27, slice 030) ---------------------------------------------------------

  private async careStatusOf(participationId: string): Promise<CareNoteStatus> {
    const sql = this.ctx.storage.sql;
    const note = sql
      .exec<CareNoteRow>('SELECT * FROM care_notes WHERE participation_id = ?', participationId)
      .toArray()[0];
    const reveals = sql
      .exec<{ n: number }>(
        'SELECT COUNT(*) AS n FROM care_reveals WHERE participation_id = ?',
        participationId,
      )
      .one().n;
    return {
      participationId,
      hasCareNote: Boolean(note),
      updatedAt: note?.updated_at ?? null,
      updatedByName: note?.updated_by_name ?? null,
      reveals,
    };
  }

  /** The traveler row behind a care note, or null when the id is not a traveler of this trip. */
  private async travelerOf(tripId: string, participationId: string): Promise<Participation | null> {
    const p = await this.getParticipation(participationId);
    return p && p.tripId === tripId && p.role === 'traveler' ? p : null;
  }

  async careNoteStatus(
    tripId: string,
    participationId: string,
  ): Promise<CareNoteStatus | { notFound: true }> {
    this.requireOrg();
    if (!(await this.travelerOf(tripId, participationId))) return { notFound: true };
    return this.careStatusOf(participationId);
  }

  /**
   * Seal and store the note (an all-blank note clears the row). The content is encrypted here,
   * inside the object, so neither the request log nor the storage carries it in clear.
   */
  async putCareNote(
    tripId: string,
    participationId: string,
    note: CareNote,
    by: { name: string; role: string },
    now: string,
  ): Promise<CareNoteStatus | { notFound: true } | { notConfigured: true }> {
    this.requireOrg();
    if (!(await this.travelerOf(tripId, participationId))) return { notFound: true };
    const sql = this.ctx.storage.sql;
    if (careNoteIsEmpty(note)) {
      sql.exec('DELETE FROM care_notes WHERE participation_id = ?', participationId);
      return this.careStatusOf(participationId);
    }
    const key = await careKeyFrom(this.env as Bindings);
    if (!key) return { notConfigured: true };
    const sealed = await seal(
      key,
      JSON.stringify({
        allergies: note.allergies.trim(),
        medications: note.medications.trim(),
        freeText: note.freeText.trim(),
      }),
    );
    sql.exec(
      `INSERT INTO care_notes (participation_id, trip_id, iv, ciphertext, updated_at, updated_by_name, updated_by_role)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(participation_id) DO UPDATE SET iv = excluded.iv, ciphertext = excluded.ciphertext,
         updated_at = excluded.updated_at, updated_by_name = excluded.updated_by_name, updated_by_role = excluded.updated_by_role`,
      participationId,
      tripId,
      sealed.iv,
      sealed.ct,
      now,
      by.name,
      by.role,
    );
    return this.careStatusOf(participationId);
  }

  /** Decrypt for one reader and record the reveal (who, as which role, when). */
  async revealCareNote(
    tripId: string,
    participationId: string,
    by: { name: string; role: string },
    now: string,
  ): Promise<
    RevealCareNoteResponse | { notFound: true } | { none: true } | { notConfigured: true }
  > {
    this.requireOrg();
    if (!(await this.travelerOf(tripId, participationId))) return { notFound: true };
    const sql = this.ctx.storage.sql;
    const row = sql
      .exec<CareNoteRow>('SELECT * FROM care_notes WHERE participation_id = ?', participationId)
      .toArray()[0];
    if (!row) return { none: true };
    const key = await careKeyFrom(this.env as Bindings);
    if (!key) return { notConfigured: true };
    const note = JSON.parse(await unseal(key, { iv: row.iv, ct: row.ciphertext })) as CareNote;
    sql.exec(
      'INSERT INTO care_reveals (id, participation_id, trip_id, revealed_by_name, revealed_by_role, revealed_at) VALUES (?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(),
      participationId,
      tripId,
      by.name,
      by.role,
      now,
    );
    return {
      participationId,
      note,
      updatedAt: row.updated_at,
      updatedByName: row.updated_by_name,
      revealedAt: now,
    };
  }

  // ---- Photos (D18, slice 043) ---------------------------------------------------------------

  private photoOf(r: PhotoRow, viewer: PhotoViewer, names: Map<string, string>): Photo {
    const org = this.requireOrg();
    const tags = JSON.parse(r.album_tags) as string[];
    const flagged = r.flag !== null && r.reviewed_at === null;
    const base = `/v1/orgs/${org}/trips/${r.trip_id}/media/${r.id}`;
    return {
      id: r.id,
      tripId: r.trip_id,
      uploaderName: r.uploader_name,
      uploaderRole: r.uploader_role as PhotoUploaderRole,
      mine: r.uploader_key === viewer.key,
      day: r.day,
      takenAt: r.taken_at,
      contentType: r.content_type as PhotoContentType,
      bytes: r.bytes,
      thumbnailBytes: r.thumb_bytes,
      status: flagged ? 'flagged' : r.album_at ? 'approved' : 'pool',
      flag: r.flag as PhotoFlag | null,
      reviewedByName: r.reviewed_by_name,
      album: r.album_at
        ? {
            at: r.album_at,
            byName: r.album_by_name ?? '',
            wholeGroup: r.album_group === 1,
            participationIds: tags,
            taggedNames: tags.map((id) => names.get(id) ?? 'Removed from roster'),
          }
        : null,
      uploadedAt: r.uploaded_at,
      thumbnailUrl: `${base}/thumbnail`,
      contentUrl: `${base}/content`,
    };
  }

  /**
   * ADR-0009: guardians see approved photos tagged with their traveler or the whole group and
   * nothing flagged; a flagged photo waits for staff (owner, organizer, leader) and stays visible
   * to its uploader; everything else in the pool is for every participant.
   */
  private photoVisibleTo(r: PhotoRow, viewer: PhotoViewer): boolean {
    const flagged = r.flag !== null && r.reviewed_at === null;
    if (viewer.role === 'guardian') {
      if (!r.album_at || flagged) return false;
      if (r.album_group === 1) return true;
      return (
        viewer.guardianOf !== null &&
        (JSON.parse(r.album_tags) as string[]).includes(viewer.guardianOf)
      );
    }
    if (flagged) return viewer.role !== 'traveler' || r.uploader_key === viewer.key;
    return true;
  }

  private rosterNames(tripId: string): Map<string, string> {
    const names = new Map<string, string>();
    for (const r of this.ctx.storage.sql
      .exec<{ id: string; display_name: string }>(
        'SELECT id, display_name FROM participations WHERE trip_id = ?',
        tripId,
      )
      .toArray()) {
      names.set(r.id, r.display_name);
    }
    return names;
  }

  private photoRow(tripId: string, photoId: string): PhotoRow | null {
    return (
      this.ctx.storage.sql
        .exec<PhotoRow>('SELECT * FROM photos WHERE id = ? AND trip_id = ?', photoId, tripId)
        .toArray()[0] ?? null
    );
  }

  /** Metadata of an upload whose bytes already sit sealed in R2; the flag comes from the AI port. */
  async addPhoto(input: {
    id: string;
    tripId: string;
    uploader: PhotoViewer;
    day: number;
    takenAt: string;
    contentType: PhotoContentType;
    bytes: number;
    thumbnailBytes: number;
    flag: PhotoFlag | null;
    now: string;
  }): Promise<Photo | { notFound: true }> {
    this.requireOrg();
    if (!(await this.getTrip(input.tripId))) return { notFound: true };
    const row: PhotoRow = {
      id: input.id,
      trip_id: input.tripId,
      uploader_key: input.uploader.key,
      uploader_name: input.uploader.name,
      uploader_role: input.uploader.role,
      day: input.day,
      taken_at: input.takenAt,
      content_type: input.contentType,
      bytes: input.bytes,
      thumb_bytes: input.thumbnailBytes,
      flag: input.flag,
      reviewed_at: null,
      reviewed_by_name: null,
      album_at: null,
      album_by_name: null,
      album_group: 0,
      album_tags: '[]',
      uploaded_at: input.now,
    };
    this.ctx.storage.sql.exec(
      `INSERT INTO photos (id, trip_id, uploader_key, uploader_name, uploader_role, day, taken_at, content_type, bytes, thumb_bytes, flag, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.trip_id,
      row.uploader_key,
      row.uploader_name,
      row.uploader_role,
      row.day,
      row.taken_at,
      row.content_type,
      row.bytes,
      row.thumb_bytes,
      row.flag,
      row.uploaded_at,
    );
    return this.photoOf(row, input.uploader, this.rosterNames(input.tripId));
  }

  /** Newest first, only what the viewer may see; the counts describe that same set. */
  async listPhotos(tripId: string, viewer: PhotoViewer): Promise<PhotoList | { notFound: true }> {
    this.requireOrg();
    if (!(await this.getTrip(tripId))) return { notFound: true };
    const names = this.rosterNames(tripId);
    const photos = this.ctx.storage.sql
      .exec<PhotoRow>(
        'SELECT * FROM photos WHERE trip_id = ? ORDER BY uploaded_at DESC, id DESC',
        tripId,
      )
      .toArray()
      .filter((r) => this.photoVisibleTo(r, viewer))
      .map((r) => this.photoOf(r, viewer, names));
    return {
      photos,
      counts: {
        pool: photos.filter((p) => p.status !== 'flagged').length,
        flagged: photos.filter((p) => p.status === 'flagged').length,
        approved: photos.filter((p) => p.status === 'approved').length,
      },
    };
  }

  /** One photo as the viewer sees it; an invisible one is not found (nothing to learn). */
  async getPhoto(
    tripId: string,
    photoId: string,
    viewer: PhotoViewer,
  ): Promise<Photo | { notFound: true }> {
    this.requireOrg();
    const row = this.photoRow(tripId, photoId);
    if (!row || !this.photoVisibleTo(row, viewer)) return { notFound: true };
    return this.photoOf(row, viewer, this.rosterNames(tripId));
  }

  /** A leader clears the flag: the photo returns to the pool; the flag stays as history. */
  async clearPhotoFlag(
    tripId: string,
    photoId: string,
    by: PhotoViewer,
    now: string,
  ): Promise<Photo | { notFound: true } | { notFlagged: true }> {
    this.requireOrg();
    const row = this.photoRow(tripId, photoId);
    if (!row) return { notFound: true };
    if (row.flag === null || row.reviewed_at !== null) return { notFlagged: true };
    this.ctx.storage.sql.exec(
      'UPDATE photos SET reviewed_at = ?, reviewed_by_name = ? WHERE id = ?',
      now,
      by.name,
      photoId,
    );
    return this.photoOf(
      { ...row, reviewed_at: now, reviewed_by_name: by.name },
      by,
      this.rosterNames(tripId),
    );
  }

  /** Into the guardian album with its tags (travelers of this trip, or the whole group). */
  async setPhotoAlbum(
    tripId: string,
    photoId: string,
    tags: { wholeGroup: boolean; participationIds: string[] },
    by: PhotoViewer,
    now: string,
  ): Promise<Photo | { notFound: true } | { flagged: true } | { badTag: string }> {
    this.requireOrg();
    const row = this.photoRow(tripId, photoId);
    if (!row) return { notFound: true };
    if (row.flag !== null && row.reviewed_at === null) return { flagged: true };
    const travelers = new Set(
      this.ctx.storage.sql
        .exec<{ id: string }>(
          "SELECT id FROM participations WHERE trip_id = ? AND role = 'traveler'",
          tripId,
        )
        .toArray()
        .map((r) => r.id),
    );
    const ids = [...new Set(tags.participationIds)];
    for (const id of ids) if (!travelers.has(id)) return { badTag: id };
    const next: PhotoRow = {
      ...row,
      album_at: now,
      album_by_name: by.name,
      album_group: tags.wholeGroup ? 1 : 0,
      album_tags: JSON.stringify(ids),
    };
    this.ctx.storage.sql.exec(
      'UPDATE photos SET album_at = ?, album_by_name = ?, album_group = ?, album_tags = ? WHERE id = ?',
      next.album_at,
      next.album_by_name,
      next.album_group,
      next.album_tags,
      photoId,
    );
    return this.photoOf(next, by, this.rosterNames(tripId));
  }

  async clearPhotoAlbum(
    tripId: string,
    photoId: string,
    by: PhotoViewer,
  ): Promise<Photo | { notFound: true }> {
    this.requireOrg();
    const row = this.photoRow(tripId, photoId);
    if (!row) return { notFound: true };
    this.ctx.storage.sql.exec(
      "UPDATE photos SET album_at = NULL, album_by_name = NULL, album_group = 0, album_tags = '[]' WHERE id = ?",
      photoId,
    );
    return this.photoOf(
      { ...row, album_at: null, album_by_name: null, album_group: 0, album_tags: '[]' },
      by,
      this.rosterNames(tripId),
    );
  }

  /** The row goes; the route shreds the R2 objects. Answers the row so the route can check who may. */
  async deletePhoto(
    tripId: string,
    photoId: string,
  ): Promise<{ deleted: true } | { notFound: true }> {
    this.requireOrg();
    const row = this.photoRow(tripId, photoId);
    if (!row) return { notFound: true };
    this.ctx.storage.sql.exec('DELETE FROM photos WHERE id = ?', photoId);
    return { deleted: true };
  }

  /** The uploader key of a photo, for the delete rule (own photo or organizer). */
  async photoUploaderKey(tripId: string, photoId: string): Promise<string | null> {
    this.requireOrg();
    return this.photoRow(tripId, photoId)?.uploader_key ?? null;
  }

  // ---- Documents and forms (D27, slice 045) ------------------------------------------------

  private travelerIds(tripId: string): string[] {
    return this.ctx.storage.sql
      .exec<{ id: string }>(
        "SELECT id FROM participations WHERE trip_id = ? AND role = 'traveler'",
        tripId,
      )
      .toArray()
      .map((r) => r.id);
  }

  private documentRequirementOf(r: DocumentRequirementRow, travelers: number): DocumentRequirement {
    const items = this.ctx.storage.sql
      .exec<DocumentItemRow>('SELECT * FROM document_items WHERE requirement_id = ?', r.id)
      .toArray();
    const collected = items.filter((i) => i.state === 'collected').length;
    const waived = items.filter((i) => i.state === 'waived').length;
    return {
      id: r.id,
      tripId: r.trip_id,
      name: r.name,
      required: r.required === 1,
      dueOn: r.due_on,
      createdAt: r.created_at,
      counts: {
        travelers,
        collected,
        waived,
        missing: Math.max(0, travelers - collected - waived),
        scans: items.filter((i) => i.scan_content_type !== null).length,
      },
    };
  }

  private documentRequirementRow(tripId: string, id: string): DocumentRequirementRow | null {
    return (
      this.ctx.storage.sql
        .exec<DocumentRequirementRow>(
          'SELECT * FROM document_requirements WHERE id = ? AND trip_id = ?',
          id,
          tripId,
        )
        .toArray()[0] ?? null
    );
  }

  async listDocumentRequirements(
    tripId: string,
  ): Promise<DocumentRequirementList | { notFound: true }> {
    this.requireOrg();
    if (!(await this.getTrip(tripId))) return { notFound: true };
    const travelers = this.travelerIds(tripId).length;
    const requirements = this.ctx.storage.sql
      .exec<DocumentRequirementRow>(
        'SELECT * FROM document_requirements WHERE trip_id = ? ORDER BY created_at, id',
        tripId,
      )
      .toArray()
      .map((r) => this.documentRequirementOf(r, travelers));
    return {
      requirements,
      travelers,
      missingRequired: requirements
        .filter((r) => r.required)
        .reduce((n, r) => n + r.counts.missing, 0),
    };
  }

  async createDocumentRequirement(
    tripId: string,
    input: { name: string; required: boolean; dueOn: string | null },
    now: string,
  ): Promise<DocumentRequirement | { notFound: true }> {
    this.requireOrg();
    if (!(await this.getTrip(tripId))) return { notFound: true };
    const row: DocumentRequirementRow = {
      id: crypto.randomUUID(),
      trip_id: tripId,
      name: input.name,
      required: input.required ? 1 : 0,
      due_on: input.dueOn,
      created_at: now,
    };
    this.ctx.storage.sql.exec(
      'INSERT INTO document_requirements (id, trip_id, name, required, due_on, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      row.id,
      row.trip_id,
      row.name,
      row.required,
      row.due_on,
      row.created_at,
    );
    return this.documentRequirementOf(row, this.travelerIds(tripId).length);
  }

  async updateDocumentRequirement(
    tripId: string,
    id: string,
    patch: {
      name?: string | undefined;
      required?: boolean | undefined;
      dueOn?: string | null | undefined;
    },
  ): Promise<DocumentRequirement | { notFound: true }> {
    this.requireOrg();
    const row = this.documentRequirementRow(tripId, id);
    if (!row) return { notFound: true };
    const next: DocumentRequirementRow = {
      ...row,
      name: patch.name ?? row.name,
      required: patch.required === undefined ? row.required : patch.required ? 1 : 0,
      due_on: patch.dueOn === undefined ? row.due_on : patch.dueOn,
    };
    this.ctx.storage.sql.exec(
      'UPDATE document_requirements SET name = ?, required = ?, due_on = ? WHERE id = ?',
      next.name,
      next.required,
      next.due_on,
      id,
    );
    return this.documentRequirementOf(next, this.travelerIds(tripId).length);
  }

  /** The requirement and its items go; answers the travelers whose scans the route shreds. */
  async deleteDocumentRequirement(
    tripId: string,
    id: string,
  ): Promise<{ scans: string[] } | { notFound: true }> {
    this.requireOrg();
    if (!this.documentRequirementRow(tripId, id)) return { notFound: true };
    const sql = this.ctx.storage.sql;
    const scans = sql
      .exec<{ participation_id: string }>(
        'SELECT participation_id FROM document_items WHERE requirement_id = ? AND scan_content_type IS NOT NULL',
        id,
      )
      .toArray()
      .map((r) => r.participation_id);
    this.ctx.storage.transactionSync(() => {
      sql.exec('DELETE FROM document_items WHERE requirement_id = ?', id);
      sql.exec('DELETE FROM document_requirements WHERE id = ?', id);
    });
    return { scans };
  }

  private documentItemOf(
    requirementId: string,
    p: ParticipationRow,
    row: DocumentItemRow | null,
  ): DocumentItem {
    const reveals = this.ctx.storage.sql
      .exec<{ n: number }>(
        "SELECT COUNT(*) AS n FROM participation_events WHERE participation_id = ? AND kind = 'document_reveal' AND detail LIKE ?",
        p.id,
        `%"${requirementId}"%`,
      )
      .one().n;
    return {
      requirementId,
      participationId: p.id,
      displayName: p.display_name,
      groupName: p.group_name,
      state: (row?.state ?? 'missing') as DocumentState,
      updatedAt: row?.updated_at ?? null,
      updatedByName: row?.updated_by_name ?? null,
      scan:
        row?.scan_content_type && row.scan_bytes !== null && row.scan_uploaded_at
          ? {
              contentType: row.scan_content_type as DocumentScanType,
              bytes: row.scan_bytes,
              uploadedAt: row.scan_uploaded_at,
              uploadedByName: row.scan_uploaded_by_name ?? '',
            }
          : null,
      reveals,
    };
  }

  /** Every traveler of the trip under the requirement, group then name; absent rows read missing. */
  async documentItems(
    tripId: string,
    requirementId: string,
  ): Promise<{ requirement: DocumentRequirement; items: DocumentItem[] } | { notFound: true }> {
    this.requireOrg();
    const req = this.documentRequirementRow(tripId, requirementId);
    if (!req) return { notFound: true };
    const sql = this.ctx.storage.sql;
    const travelers = sql
      .exec<ParticipationRow>(
        "SELECT * FROM participations WHERE trip_id = ? AND role = 'traveler' ORDER BY group_name, display_name",
        tripId,
      )
      .toArray();
    const rows = new Map(
      sql
        .exec<DocumentItemRow>(
          'SELECT * FROM document_items WHERE requirement_id = ?',
          requirementId,
        )
        .toArray()
        .map((r) => [r.participation_id, r] as const),
    );
    return {
      requirement: this.documentRequirementOf(req, travelers.length),
      items: travelers.map((p) => this.documentItemOf(requirementId, p, rows.get(p.id) ?? null)),
    };
  }

  private documentTraveler(tripId: string, participationId: string): ParticipationRow | null {
    return (
      this.ctx.storage.sql
        .exec<ParticipationRow>(
          "SELECT * FROM participations WHERE id = ? AND trip_id = ? AND role = 'traveler'",
          participationId,
          tripId,
        )
        .toArray()[0] ?? null
    );
  }

  private documentItemRow(requirementId: string, participationId: string): DocumentItemRow | null {
    return (
      this.ctx.storage.sql
        .exec<DocumentItemRow>(
          'SELECT * FROM document_items WHERE requirement_id = ? AND participation_id = ?',
          requirementId,
          participationId,
        )
        .toArray()[0] ?? null
    );
  }

  private upsertDocumentItem(row: DocumentItemRow): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO document_items (requirement_id, participation_id, trip_id, state, updated_at, updated_by_name, scan_content_type, scan_bytes, scan_uploaded_at, scan_uploaded_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(requirement_id, participation_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at,
         updated_by_name = excluded.updated_by_name, scan_content_type = excluded.scan_content_type, scan_bytes = excluded.scan_bytes,
         scan_uploaded_at = excluded.scan_uploaded_at, scan_uploaded_by_name = excluded.scan_uploaded_by_name`,
      row.requirement_id,
      row.participation_id,
      row.trip_id,
      row.state,
      row.updated_at,
      row.updated_by_name,
      row.scan_content_type,
      row.scan_bytes,
      row.scan_uploaded_at,
      row.scan_uploaded_by_name,
    );
  }

  async setDocumentState(
    tripId: string,
    requirementId: string,
    participationId: string,
    state: DocumentState,
    byName: string,
    now: string,
  ): Promise<DocumentItem | { notFound: true }> {
    this.requireOrg();
    const p = this.documentTraveler(tripId, participationId);
    if (!p || !this.documentRequirementRow(tripId, requirementId)) return { notFound: true };
    const row: DocumentItemRow = {
      requirement_id: requirementId,
      participation_id: participationId,
      trip_id: tripId,
      scan_content_type: null,
      scan_bytes: null,
      scan_uploaded_at: null,
      scan_uploaded_by_name: null,
      ...(this.documentItemRow(requirementId, participationId) ?? {}),
      state,
      updated_at: now,
      updated_by_name: byName,
    };
    this.upsertDocumentItem(row);
    return this.documentItemOf(requirementId, p, row);
  }

  /** A scan on file marks the item collected; the bytes already sit sealed in R2. */
  async setDocumentScan(
    tripId: string,
    requirementId: string,
    participationId: string,
    scan: { contentType: DocumentScanType; bytes: number },
    byName: string,
    now: string,
  ): Promise<DocumentItem | { notFound: true }> {
    this.requireOrg();
    const p = this.documentTraveler(tripId, participationId);
    if (!p || !this.documentRequirementRow(tripId, requirementId)) return { notFound: true };
    const row: DocumentItemRow = {
      ...(this.documentItemRow(requirementId, participationId) ?? {
        requirement_id: requirementId,
        participation_id: participationId,
        trip_id: tripId,
      }),
      requirement_id: requirementId,
      participation_id: participationId,
      trip_id: tripId,
      state: 'collected',
      updated_at: now,
      updated_by_name: byName,
      scan_content_type: scan.contentType,
      scan_bytes: scan.bytes,
      scan_uploaded_at: now,
      scan_uploaded_by_name: byName,
    };
    this.upsertDocumentItem(row);
    return this.documentItemOf(requirementId, p, row);
  }

  /** The scan's facts go; the state stays (the paper may still be on file). */
  async clearDocumentScan(
    tripId: string,
    requirementId: string,
    participationId: string,
  ): Promise<DocumentItem | { notFound: true } | { noScan: true }> {
    this.requireOrg();
    const p = this.documentTraveler(tripId, participationId);
    const row = this.documentItemRow(requirementId, participationId);
    if (!p || !row) return { notFound: true };
    if (!row.scan_content_type) return { noScan: true };
    const next: DocumentItemRow = {
      ...row,
      scan_content_type: null,
      scan_bytes: null,
      scan_uploaded_at: null,
      scan_uploaded_by_name: null,
    };
    this.upsertDocumentItem(next);
    return this.documentItemOf(requirementId, p, next);
  }

  /** The scan's type for the reveal route, with the requirement's name for the audit line. */
  async documentScan(
    tripId: string,
    requirementId: string,
    participationId: string,
  ): Promise<{ contentType: DocumentScanType; requirementName: string } | null> {
    this.requireOrg();
    const req = this.documentRequirementRow(tripId, requirementId);
    const row = this.documentItemRow(requirementId, participationId);
    if (!req || !row?.scan_content_type) return null;
    return { contentType: row.scan_content_type as DocumentScanType, requirementName: req.name };
  }

  /** Every reveal is a fact on the traveler's timeline (D27): who, which document, when. */
  async recordDocumentReveal(
    tripId: string,
    requirementId: string,
    participationId: string,
    byName: string,
    now: string,
  ): Promise<void> {
    this.requireOrg();
    const req = this.documentRequirementRow(tripId, requirementId);
    this.ctx.storage.sql.exec(
      'INSERT INTO participation_events (id, participation_id, trip_id, kind, by_name, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(),
      participationId,
      tripId,
      'document_reveal',
      byName,
      JSON.stringify({ requirementId, name: req?.name ?? '' }),
      now,
    );
  }

  /** The report's documents tile: completion over the required requirements. */
  async documentSummary(tripId: string): Promise<DocumentSummary | null> {
    this.requireOrg();
    const list = await this.listDocumentRequirements(tripId);
    if ('notFound' in list || list.requirements.length === 0) return null;
    const required = list.requirements.filter((r) => r.required);
    const requiredItems = required.length * list.travelers;
    const requiredDone = required.reduce((n, r) => n + r.counts.collected + r.counts.waived, 0);
    return {
      requirements: list.requirements.length,
      required: required.length,
      travelers: list.travelers,
      requiredItems,
      requiredDone,
      missingRequired: list.missingRequired,
      completionPct: requiredItems === 0 ? null : Math.round((requiredDone / requiredItems) * 100),
    };
  }

  // ---- Travel bookings (D37, slice 046) ------------------------------------------------------

  private bookingOf(r: TravelBookingRow, roster: Participation[]): Booking {
    const base = { id: r.id, tripId: r.trip_id, createdAt: r.created_at };
    if (r.kind === 'flight') {
      return { ...(JSON.parse(r.data) as Omit<FlightInput, 'kind'>), kind: 'flight', ...base };
    }
    if (r.kind === 'hotel') {
      const h = JSON.parse(r.data) as Omit<HotelInput, 'kind'>;
      return { ...h, kind: 'hotel', ...base, nights: nightsBetween(h.checkIn, h.checkOut) };
    }
    const b = JSON.parse(r.data) as Omit<BusInput, 'kind'>;
    const groups = new Set(b.groups);
    const assigned = roster.filter(
      (p) =>
        (p.role === 'traveler' || p.role === 'leader') &&
        p.groupName !== null &&
        groups.has(p.groupName),
    ).length;
    return { ...b, kind: 'bus', ...base, assigned };
  }

  private bookingRow(tripId: string, id: string): TravelBookingRow | null {
    return (
      this.ctx.storage.sql
        .exec<TravelBookingRow>(
          'SELECT * FROM travel_bookings WHERE id = ? AND trip_id = ?',
          id,
          tripId,
        )
        .toArray()[0] ?? null
    );
  }

  /** Flights, hotels and buses in creation order; the roster's groups and traveler count for the forms. */
  async travelPlan(tripId: string): Promise<TravelPlan | { notFound: true }> {
    this.requireOrg();
    if (!(await this.getTrip(tripId))) return { notFound: true };
    const roster = await this.listRoster(tripId);
    const bookings = this.ctx.storage.sql
      .exec<TravelBookingRow>(
        'SELECT * FROM travel_bookings WHERE trip_id = ? ORDER BY created_at, id',
        tripId,
      )
      .toArray()
      .map((r) => this.bookingOf(r, roster));
    const groups = [
      ...new Set(roster.map((p) => p.groupName).filter((g): g is string => g !== null)),
    ].sort();
    return {
      flights: bookings.filter(
        (b): b is Extract<Booking, { kind: 'flight' }> => b.kind === 'flight',
      ),
      hotels: bookings.filter((b): b is Extract<Booking, { kind: 'hotel' }> => b.kind === 'hotel'),
      buses: bookings.filter((b): b is Extract<Booking, { kind: 'bus' }> => b.kind === 'bus'),
      groups,
      travelers: roster.filter((p) => p.role === 'traveler').length,
    };
  }

  async createBooking(
    tripId: string,
    input: FlightInput | HotelInput | BusInput,
    now: string,
  ): Promise<Booking | { notFound: true }> {
    this.requireOrg();
    if (!(await this.getTrip(tripId))) return { notFound: true };
    const { kind, ...data } = input;
    const row: TravelBookingRow = {
      id: crypto.randomUUID(),
      trip_id: tripId,
      kind,
      data: JSON.stringify(data),
      created_at: now,
    };
    this.ctx.storage.sql.exec(
      'INSERT INTO travel_bookings (id, trip_id, kind, data, created_at) VALUES (?, ?, ?, ?, ?)',
      row.id,
      row.trip_id,
      row.kind,
      row.data,
      row.created_at,
    );
    return this.bookingOf(row, await this.listRoster(tripId));
  }

  /** Any subset of the kind's fields; a patch for another kind is refused. */
  async updateBooking(
    tripId: string,
    id: string,
    patch: { kind: string } & Record<string, unknown>,
  ): Promise<Booking | { notFound: true } | { kindMismatch: true }> {
    this.requireOrg();
    const row = this.bookingRow(tripId, id);
    if (!row) return { notFound: true };
    if (row.kind !== patch.kind) return { kindMismatch: true };
    const { kind: _kind, ...fields } = patch;
    const merged = { ...(JSON.parse(row.data) as Record<string, unknown>) };
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) merged[k] = v;
    const next: TravelBookingRow = { ...row, data: JSON.stringify(merged) };
    this.ctx.storage.sql.exec('UPDATE travel_bookings SET data = ? WHERE id = ?', next.data, id);
    return this.bookingOf(next, await this.listRoster(tripId));
  }

  async deleteBooking(tripId: string, id: string): Promise<{ deleted: true } | { notFound: true }> {
    this.requireOrg();
    if (!this.bookingRow(tripId, id)) return { notFound: true };
    this.ctx.storage.transactionSync(() => {
      // A bus's driver links die with it (slice 049); a hotel's rooming list and links too (slice 058).
      this.ctx.storage.sql.exec('DELETE FROM driver_links WHERE booking_id = ?', id);
      this.ctx.storage.sql.exec('DELETE FROM hotel_links WHERE booking_id = ?', id);
      this.ctx.storage.sql.exec('DELETE FROM room_assignments WHERE booking_id = ?', id);
      this.ctx.storage.sql.exec('DELETE FROM travel_bookings WHERE id = ?', id);
    });
    return { deleted: true };
  }

  // ---- The driver's sealed link (D27, D39, slice 049) ----

  private driverLinkOf(r: DriverLinkRow): DriverLink {
    return {
      id: r.id,
      tripId: r.trip_id,
      bookingId: r.booking_id,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
      opens: r.opens,
      lastOpenedAt: r.last_opened_at,
    };
  }

  /** A link to one bus; only the token's hash is kept. The booking must be a bus of the trip. */
  async createDriverLink(
    tripId: string,
    bookingId: string,
    tokenHash: string,
    now: string,
    expiresAt: string,
  ): Promise<DriverLink | { notFound: true }> {
    this.requireOrg();
    const booking = this.bookingRow(tripId, bookingId);
    if (booking?.kind !== 'bus') return { notFound: true };
    const row: DriverLinkRow = {
      id: crypto.randomUUID(),
      trip_id: tripId,
      booking_id: bookingId,
      token_hash: tokenHash,
      created_at: now,
      expires_at: expiresAt,
      revoked_at: null,
      opens: 0,
      last_opened_at: null,
    };
    this.ctx.storage.sql.exec(
      'INSERT INTO driver_links (id, trip_id, booking_id, token_hash, created_at, expires_at, revoked_at, opens, last_opened_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      row.id,
      row.trip_id,
      row.booking_id,
      row.token_hash,
      row.created_at,
      row.expires_at,
      row.revoked_at,
      row.opens,
      row.last_opened_at,
    );
    return this.driverLinkOf(row);
  }

  async listDriverLinks(
    tripId: string,
    bookingId: string,
  ): Promise<DriverLink[] | { notFound: true }> {
    this.requireOrg();
    if (!this.bookingRow(tripId, bookingId)) return { notFound: true };
    return this.ctx.storage.sql
      .exec<DriverLinkRow>(
        'SELECT * FROM driver_links WHERE booking_id = ? ORDER BY created_at DESC, id',
        bookingId,
      )
      .toArray()
      .map((r) => this.driverLinkOf(r));
  }

  /** Revoking keeps the row (the opens stay as a fact); the link answers nothing from now on. */
  async revokeDriverLink(
    tripId: string,
    linkId: string,
    now: string,
  ): Promise<DriverLink | { notFound: true }> {
    this.requireOrg();
    const row =
      this.ctx.storage.sql
        .exec<DriverLinkRow>(
          'SELECT * FROM driver_links WHERE id = ? AND trip_id = ?',
          linkId,
          tripId,
        )
        .toArray()[0] ?? null;
    if (!row) return { notFound: true };
    const next: DriverLinkRow = { ...row, revoked_at: row.revoked_at ?? now };
    this.ctx.storage.sql.exec(
      'UPDATE driver_links SET revoked_at = ? WHERE id = ?',
      next.revoked_at,
      linkId,
    );
    return this.driverLinkOf(next);
  }

  /**
   * The sheet behind a token: unknown, expired and revoked are one answer (nothing to learn).
   * Each open is counted. Names only: leaders and travelers of the roster groups the bus names.
   */
  async openDriverSheet(
    tokenHash: string,
    now: string,
  ): Promise<Omit<DriverSheet, 'organizationName'> | { notFound: true }> {
    this.requireOrg();
    const sql = this.ctx.storage.sql;
    const link =
      sql
        .exec<DriverLinkRow>('SELECT * FROM driver_links WHERE token_hash = ?', tokenHash)
        .toArray()[0] ?? null;
    if (!link || link.revoked_at || link.expires_at <= now) return { notFound: true };
    const booking = this.bookingRow(link.trip_id, link.booking_id);
    const trip = await this.getTrip(link.trip_id);
    if (booking?.kind !== 'bus' || !trip) return { notFound: true };
    sql.exec(
      'UPDATE driver_links SET opens = opens + 1, last_opened_at = ? WHERE id = ?',
      now,
      link.id,
    );
    const bus = JSON.parse(booking.data) as {
      label: string;
      company: string;
      seats: number;
      groups?: string[];
    };
    const roster = await this.listRoster(link.trip_id);
    const groups = (bus.groups ?? []).map((name) => {
      const riding = roster.filter((p) => p.groupName === name);
      const names = (role: string) =>
        riding
          .filter((p) => p.role === role)
          .map((p) => p.displayName)
          .sort((a, b) => a.localeCompare(b));
      return { name, leaders: names('leader'), travelers: names('traveler') };
    });
    return {
      tripName: trip.name,
      startsOn: trip.startsOn,
      endsOn: trip.endsOn,
      bus: { label: bus.label, company: bus.company, seats: bus.seats },
      groups,
      leaders: groups.reduce((n, g) => n + g.leaders.length, 0),
      travelers: groups.reduce((n, g) => n + g.travelers.length, 0),
      expiresAt: link.expires_at,
    };
  }

  // ---- Rooming lists and the hotel's sealed link (D27, D41; slice 058) ----

  private hotelOf(row: TravelBookingRow): RoomingList['hotel'] | null {
    if (row.kind !== 'hotel') return null;
    const d = JSON.parse(row.data) as {
      name: string;
      city: string;
      checkIn: string;
      checkOut: string;
      rooms: number;
      confirmation?: string;
    };
    return {
      id: row.id,
      name: d.name,
      city: d.city,
      checkIn: d.checkIn,
      checkOut: d.checkOut,
      rooms: d.rooms,
    };
  }

  /** Who sleeps where in one hotel: leaders first, then travelers by group and name. */
  async rooming(tripId: string, bookingId: string): Promise<RoomingList | { notFound: true }> {
    this.requireOrg();
    const row = this.bookingRow(tripId, bookingId);
    const hotel = row ? this.hotelOf(row) : null;
    if (!hotel) return { notFound: true };
    const rooms = new Map(
      this.ctx.storage.sql
        .exec<RoomAssignmentRow>('SELECT * FROM room_assignments WHERE booking_id = ?', bookingId)
        .toArray()
        .map((r) => [r.participation_id, r.room] as const),
    );
    const roster = await this.listRoster(tripId);
    const people: RoomAssignment[] = roster
      .filter((p) => p.role === 'leader' || p.role === 'traveler')
      .sort(
        (a, b) =>
          (a.role === 'leader' ? 0 : 1) - (b.role === 'leader' ? 0 : 1) ||
          (a.groupName ?? '').localeCompare(b.groupName ?? '') ||
          a.displayName.localeCompare(b.displayName),
      )
      .map((p) => ({
        participationId: p.id,
        displayName: p.displayName,
        role: p.role as 'leader' | 'traveler',
        groupName: p.groupName,
        room: rooms.get(p.id) ?? null,
      }));
    return {
      hotel,
      people,
      roomsUsed: new Set(people.map((p) => p.room).filter((r) => r !== null)).size,
      assigned: people.filter((p) => p.room !== null).length,
    };
  }

  /**
   * Slice 070: who sleeps where on a date: the rooms of the hotel bookings whose stay covers it
   * (`checkIn <= date < checkOut`); with two such hotels the earlier booking's room wins.
   */
  async roomsOn(tripId: string, date: string): Promise<Record<string, string>> {
    this.requireOrg();
    const rooms: Record<string, string> = {};
    const bookings = this.ctx.storage.sql
      .exec<TravelBookingRow>(
        "SELECT * FROM travel_bookings WHERE trip_id = ? AND kind = 'hotel' ORDER BY created_at",
        tripId,
      )
      .toArray();
    for (const row of bookings) {
      const hotel = this.hotelOf(row);
      if (!hotel || !(hotel.checkIn <= date && date < hotel.checkOut)) continue;
      for (const r of this.ctx.storage.sql
        .exec<RoomAssignmentRow>('SELECT * FROM room_assignments WHERE booking_id = ?', row.id)
        .toArray()) {
        if (!(r.participation_id in rooms)) rooms[r.participation_id] = r.room;
      }
    }
    return rooms;
  }

  /**
   * Slice 075 (D41): the caller's own room for the stay that covers the date: the first hotel
   * booking covering it (creation order, like `roomsOn`), their room once placed, and who shares
   * it by name (the rooming list's order: leaders first, then by group and name). `stay: null`
   * outside any stay.
   */
  async myRoom(tripId: string, participationId: string, date: string): Promise<MyRoom> {
    this.requireOrg();
    const bookings = this.ctx.storage.sql
      .exec<TravelBookingRow>(
        "SELECT * FROM travel_bookings WHERE trip_id = ? AND kind = 'hotel' ORDER BY created_at",
        tripId,
      )
      .toArray();
    for (const row of bookings) {
      const hotel = this.hotelOf(row);
      if (!hotel || !(hotel.checkIn <= date && date < hotel.checkOut)) continue;
      const list = await this.rooming(tripId, row.id);
      if ('notFound' in list) continue;
      const room = list.people.find((p) => p.participationId === participationId)?.room ?? null;
      return {
        stay: {
          hotelName: hotel.name,
          city: hotel.city,
          checkIn: hotel.checkIn,
          checkOut: hotel.checkOut,
          room,
          roommates:
            room === null
              ? []
              : list.people
                  .filter((p) => p.room === room && p.participationId !== participationId)
                  .map((p) => p.displayName),
        },
      };
    }
    return { stay: null };
  }

  /** Puts a leader or traveler of the trip in a room of the hotel; null takes them out. */
  async assignRoom(
    tripId: string,
    bookingId: string,
    participationId: string,
    room: string | null,
    now: string,
  ): Promise<RoomingList | { notFound: true } | { notAPerson: true }> {
    this.requireOrg();
    const row = this.bookingRow(tripId, bookingId);
    if (row?.kind !== 'hotel') return { notFound: true };
    const p = await this.getParticipation(participationId);
    if (!p || p.tripId !== tripId) return { notFound: true };
    if (p.role !== 'leader' && p.role !== 'traveler') return { notAPerson: true };
    const sql = this.ctx.storage.sql;
    if (room === null) {
      sql.exec(
        'DELETE FROM room_assignments WHERE booking_id = ? AND participation_id = ?',
        bookingId,
        participationId,
      );
    } else {
      sql.exec(
        `INSERT INTO room_assignments (booking_id, participation_id, trip_id, room, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(booking_id, participation_id) DO UPDATE SET room = excluded.room, updated_at = excluded.updated_at`,
        bookingId,
        participationId,
        tripId,
        room,
        now,
      );
    }
    const list = await this.rooming(tripId, bookingId);
    return list;
  }

  /** A link to one hotel's sheet; only the token's hash is kept. The booking must be a hotel of the trip. */
  async createHotelLink(
    tripId: string,
    bookingId: string,
    tokenHash: string,
    now: string,
    expiresAt: string,
  ): Promise<DriverLink | { notFound: true }> {
    this.requireOrg();
    const booking = this.bookingRow(tripId, bookingId);
    if (booking?.kind !== 'hotel') return { notFound: true };
    const row: DriverLinkRow = {
      id: crypto.randomUUID(),
      trip_id: tripId,
      booking_id: bookingId,
      token_hash: tokenHash,
      created_at: now,
      expires_at: expiresAt,
      revoked_at: null,
      opens: 0,
      last_opened_at: null,
    };
    this.ctx.storage.sql.exec(
      'INSERT INTO hotel_links (id, trip_id, booking_id, token_hash, created_at, expires_at, revoked_at, opens, last_opened_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      row.id,
      row.trip_id,
      row.booking_id,
      row.token_hash,
      row.created_at,
      row.expires_at,
      row.revoked_at,
      row.opens,
      row.last_opened_at,
    );
    return this.driverLinkOf(row);
  }

  async listHotelLinks(
    tripId: string,
    bookingId: string,
  ): Promise<DriverLink[] | { notFound: true }> {
    this.requireOrg();
    if (this.bookingRow(tripId, bookingId)?.kind !== 'hotel') return { notFound: true };
    return this.ctx.storage.sql
      .exec<DriverLinkRow>(
        'SELECT * FROM hotel_links WHERE booking_id = ? ORDER BY created_at DESC, id',
        bookingId,
      )
      .toArray()
      .map((r) => this.driverLinkOf(r));
  }

  async revokeHotelLink(
    tripId: string,
    linkId: string,
    now: string,
  ): Promise<DriverLink | { notFound: true }> {
    this.requireOrg();
    const row =
      this.ctx.storage.sql
        .exec<DriverLinkRow>(
          'SELECT * FROM hotel_links WHERE id = ? AND trip_id = ?',
          linkId,
          tripId,
        )
        .toArray()[0] ?? null;
    if (!row) return { notFound: true };
    const next: DriverLinkRow = { ...row, revoked_at: row.revoked_at ?? now };
    this.ctx.storage.sql.exec(
      'UPDATE hotel_links SET revoked_at = ? WHERE id = ?',
      next.revoked_at,
      linkId,
    );
    return this.driverLinkOf(next);
  }

  /**
   * The sheet behind a hotel token: unknown, expired and revoked are one answer. Each open is
   * counted. The stay, the rooming list by room, the unassigned by name, the leaders by name.
   */
  async openHotelSheet(
    tokenHash: string,
    now: string,
  ): Promise<Omit<HotelSheet, 'organizationName'> | { notFound: true }> {
    this.requireOrg();
    const sql = this.ctx.storage.sql;
    const link =
      sql
        .exec<DriverLinkRow>('SELECT * FROM hotel_links WHERE token_hash = ?', tokenHash)
        .toArray()[0] ?? null;
    if (!link || link.revoked_at || link.expires_at <= now) return { notFound: true };
    const booking = this.bookingRow(link.trip_id, link.booking_id);
    const trip = await this.getTrip(link.trip_id);
    if (booking?.kind !== 'hotel' || !trip) return { notFound: true };
    sql.exec(
      'UPDATE hotel_links SET opens = opens + 1, last_opened_at = ? WHERE id = ?',
      now,
      link.id,
    );
    const d = JSON.parse(booking.data) as {
      name: string;
      city: string;
      checkIn: string;
      checkOut: string;
      rooms: number;
      confirmation?: string;
    };
    const list = await this.rooming(link.trip_id, link.booking_id);
    if ('notFound' in list) return { notFound: true };
    const byRoom = new Map<string, string[]>();
    for (const p of list.people) {
      if (p.room === null) continue;
      byRoom.set(p.room, [...(byRoom.get(p.room) ?? []), p.displayName]);
    }
    const rooms = [...byRoom.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([room, names]) => ({ room, names: names.sort((a, b) => a.localeCompare(b)) }));
    return {
      tripName: trip.name,
      hotel: {
        name: d.name,
        city: d.city,
        checkIn: d.checkIn,
        checkOut: d.checkOut,
        nights: nightsBetween(d.checkIn, d.checkOut),
        rooms: d.rooms,
        confirmation: d.confirmation ?? '',
      },
      rooms,
      unassigned: list.people.filter((p) => p.room === null).map((p) => p.displayName),
      leaders: list.people.filter((p) => p.role === 'leader').map((p) => p.displayName),
      people: list.people.length,
      expiresAt: link.expires_at,
    };
  }

  // ---- Packing checklist (D38, slice 048) ----

  private packingItemRow(tripId: string, id: string): PackingItemRow | null {
    return (
      this.ctx.storage.sql
        .exec<PackingItemRow>(
          'SELECT * FROM packing_items WHERE id = ? AND trip_id = ?',
          id,
          tripId,
        )
        .toArray()[0] ?? null
    );
  }

  private packingItemsOf(tripId: string): PackingItemRow[] {
    return this.ctx.storage.sql
      .exec<PackingItemRow>(
        'SELECT * FROM packing_items WHERE trip_id = ? ORDER BY created_at, id',
        tripId,
      )
      .toArray();
  }

  /** An item with its count over the trip's travelers (a leader's own tick is not counted). */
  private packingItemOf(r: PackingItemRow, travelerIds: Set<string>): PackingItem {
    const packed = this.ctx.storage.sql
      .exec<PackingTickRow>('SELECT * FROM packing_ticks WHERE item_id = ?', r.id)
      .toArray()
      .filter((t) => travelerIds.has(t.participation_id)).length;
    return {
      id: r.id,
      tripId: r.trip_id,
      name: r.name,
      note: r.note,
      createdAt: r.created_at,
      counts: { travelers: travelerIds.size, packed },
    };
  }

  async listPacking(tripId: string): Promise<PackingList | { notFound: true }> {
    this.requireOrg();
    if (!(await this.getTrip(tripId))) return { notFound: true };
    const sql = this.ctx.storage.sql;
    const travelers = sql
      .exec<ParticipationRow>(
        "SELECT * FROM participations WHERE trip_id = ? AND role = 'traveler' ORDER BY group_name, display_name",
        tripId,
      )
      .toArray();
    const travelerIds = new Set(travelers.map((p) => p.id));
    const rows = this.packingItemsOf(tripId);
    const itemIds = new Set(rows.map((r) => r.id));
    const ticks = sql
      .exec<PackingTickRow>('SELECT * FROM packing_ticks WHERE trip_id = ?', tripId)
      .toArray()
      .filter((t) => itemIds.has(t.item_id));
    const progress: PackingTravelerProgress[] = travelers.map((p) => {
      const mine = ticks.filter((t) => t.participation_id === p.id);
      return {
        participationId: p.id,
        displayName: p.display_name,
        groupName: p.group_name,
        packed: mine.length,
        total: rows.length,
        lastPackedAt:
          mine
            .map((t) => t.packed_at)
            .sort()
            .at(-1) ?? null,
      };
    });
    return {
      items: rows.map((r) => this.packingItemOf(r, travelerIds)),
      travelers: progress,
      ready: rows.length === 0 ? 0 : progress.filter((p) => p.packed === p.total).length,
    };
  }

  async createPackingItem(
    tripId: string,
    input: { name: string; note: string },
    now: string,
  ): Promise<PackingItem | { notFound: true }> {
    this.requireOrg();
    if (!(await this.getTrip(tripId))) return { notFound: true };
    const row: PackingItemRow = {
      id: crypto.randomUUID(),
      trip_id: tripId,
      name: input.name,
      note: input.note,
      created_at: now,
    };
    this.ctx.storage.sql.exec(
      'INSERT INTO packing_items (id, trip_id, name, note, created_at) VALUES (?, ?, ?, ?, ?)',
      row.id,
      row.trip_id,
      row.name,
      row.note,
      row.created_at,
    );
    return this.packingItemOf(row, new Set(this.travelerIds(tripId)));
  }

  async updatePackingItem(
    tripId: string,
    id: string,
    patch: { name?: string | undefined; note?: string | undefined },
  ): Promise<PackingItem | { notFound: true }> {
    this.requireOrg();
    const row = this.packingItemRow(tripId, id);
    if (!row) return { notFound: true };
    const next: PackingItemRow = {
      ...row,
      name: patch.name ?? row.name,
      note: patch.note ?? row.note,
    };
    this.ctx.storage.sql.exec(
      'UPDATE packing_items SET name = ?, note = ? WHERE id = ?',
      next.name,
      next.note,
      id,
    );
    return this.packingItemOf(next, new Set(this.travelerIds(tripId)));
  }

  async deletePackingItem(
    tripId: string,
    id: string,
  ): Promise<{ deleted: true } | { notFound: true }> {
    this.requireOrg();
    if (!this.packingItemRow(tripId, id)) return { notFound: true };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM packing_ticks WHERE item_id = ?', id);
      this.ctx.storage.sql.exec('DELETE FROM packing_items WHERE id = ?', id);
    });
    return { deleted: true };
  }

  /** The list for one participation (a traveler's or leader's own, or the traveler a guardian packs for). */
  async myPacking(
    tripId: string,
    participationId: string,
    packingFor: 'self' | 'guardian',
  ): Promise<MyPackingList | { notFound: true }> {
    this.requireOrg();
    const p = await this.getParticipation(participationId);
    if (!p || p.tripId !== tripId) return { notFound: true };
    const ticks = new Map(
      this.ctx.storage.sql
        .exec<PackingTickRow>(
          'SELECT * FROM packing_ticks WHERE participation_id = ? AND trip_id = ?',
          participationId,
          tripId,
        )
        .toArray()
        .map((t) => [t.item_id, t] as const),
    );
    const items: MyPackingItem[] = this.packingItemsOf(tripId).map((r) => {
      const t = ticks.get(r.id) ?? null;
      return {
        id: r.id,
        name: r.name,
        note: r.note,
        packed: t !== null,
        packedAt: t?.packed_at ?? null,
      };
    });
    return {
      travelerParticipationId: participationId,
      travelerName: p.displayName,
      packingFor,
      items,
      packed: items.filter((i) => i.packed).length,
      total: items.length,
    };
  }

  /** Tick or untick one item for one participation; who ticked (traveler or guardian) is kept. */
  async setPacked(
    tripId: string,
    itemId: string,
    participationId: string,
    packed: boolean,
    byRole: string,
    now: string,
  ): Promise<MyPackingItem | { notFound: true }> {
    this.requireOrg();
    const row = this.packingItemRow(tripId, itemId);
    const p = await this.getParticipation(participationId);
    if (!row || !p || p.tripId !== tripId) return { notFound: true };
    const sql = this.ctx.storage.sql;
    if (packed) {
      sql.exec(
        `INSERT INTO packing_ticks (item_id, participation_id, trip_id, packed_at, by_role) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(item_id, participation_id) DO NOTHING`,
        itemId,
        participationId,
        tripId,
        now,
        byRole,
      );
    } else {
      sql.exec(
        'DELETE FROM packing_ticks WHERE item_id = ? AND participation_id = ?',
        itemId,
        participationId,
      );
    }
    const t =
      sql
        .exec<PackingTickRow>(
          'SELECT * FROM packing_ticks WHERE item_id = ? AND participation_id = ?',
          itemId,
          participationId,
        )
        .toArray()[0] ?? null;
    return {
      id: row.id,
      name: row.name,
      note: row.note,
      packed: t !== null,
      packedAt: t?.packed_at ?? null,
    };
  }

  // ---- Notification lanes (D29, slice 052) ----

  private notificationOf(r: NotificationRow): Notification {
    return {
      id: r.id,
      tripId: r.trip_id,
      lane: r.lane as Notification['lane'],
      kind: r.kind as Notification['kind'],
      title: r.title,
      body: r.body,
      refType: r.ref_type as Notification['refType'],
      refId: r.ref_id,
      createdAt: r.created_at,
      deliverAt: r.deliver_at,
      readAt: r.read_at,
    };
  }

  /**
   * One event fans out to its audience: every participation of the trip in the given roles (all
   * three when none given), narrowed to groups when given, plus the named participations and the
   * guardians of the named travelers. Each recipient gets the lane D29 gives their role for the
   * kind (none means no row) and the lane's delivery time. Returns the counts per lane and how
   * many normal-lane rows wait for quiet hours to end.
   */
  async notify(input: {
    tripId: string;
    kind: NotificationKind;
    title: string;
    body: string;
    refType: Notification['refType'];
    refId: string;
    flags?: LaneFlags;
    audience: {
      roles?: AudienceRole[];
      groupNames?: string[];
      participationIds?: string[];
      guardiansOf?: string[];
    };
    now: string;
    timeZone: string;
    quietHours: QuietHours;
    digestAt: string;
  }): Promise<
    { priority: number; normal: number; digest: number; held: number } | { notFound: true }
  > {
    this.requireOrg();
    if (!(await this.getTrip(input.tripId))) return { notFound: true };
    const roster = this.ctx.storage.sql
      .exec<ParticipationRow>('SELECT * FROM participations WHERE trip_id = ?', input.tripId)
      .toArray();
    const roles = new Set<string>(input.audience.roles ?? ['traveler', 'leader', 'guardian']);
    const groups = input.audience.groupNames ? new Set(input.audience.groupNames) : null;
    const named = new Set(input.audience.participationIds ?? []);
    const wards = new Set(input.audience.guardiansOf ?? []);
    const recipients = roster.filter(
      (p) =>
        named.has(p.id) ||
        (p.guardian_of !== null && wards.has(p.guardian_of)) ||
        (roles.has(p.role) &&
          (groups === null || (p.group_name !== null && groups.has(p.group_name)))),
    );
    const counts = { priority: 0, normal: 0, digest: 0, held: 0 };
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      for (const p of recipients) {
        const role = p.role as AudienceRole;
        if (role !== 'traveler' && role !== 'leader' && role !== 'guardian') continue;
        const lane = laneFor(role, input.kind, input.flags ?? {});
        if (!lane) continue;
        const at = deliverAt(lane, input.now, input.timeZone, input.quietHours, input.digestAt);
        sql.exec(
          `INSERT INTO notifications (id, trip_id, participation_id, lane, kind, title, body, ref_type, ref_id, created_at, deliver_at, read_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          crypto.randomUUID(),
          input.tripId,
          p.id,
          lane,
          input.kind,
          input.title,
          input.body,
          input.refType,
          input.refId,
          input.now,
          at,
        );
        counts[lane] += 1;
        if (lane === 'normal' && at > input.now) counts.held += 1;
      }
    });
    return counts;
  }

  /**
   * One event with a body per recipient (slice 056: the packing reminder names each person's
   * own items), addressed by participation, idempotent on (participation, kind, ref): a row that
   * exists is not written again, so a cron may call this every ten minutes. Lanes and delivery
   * times as in `notify`; rows share `now` so the log reads them as one event.
   */
  async notifyRows(input: {
    tripId: string;
    kind: NotificationKind;
    title: string;
    refType: Notification['refType'];
    refId: string;
    rows: { participationId: string; body: string }[];
    now: string;
    timeZone: string;
    quietHours: QuietHours;
    digestAt: string;
  }): Promise<{ written: number; skipped: number } | { notFound: true }> {
    this.requireOrg();
    if (!(await this.getTrip(input.tripId))) return { notFound: true };
    const sql = this.ctx.storage.sql;
    const roster = new Map(
      sql
        .exec<ParticipationRow>('SELECT * FROM participations WHERE trip_id = ?', input.tripId)
        .toArray()
        .map((p) => [p.id, p] as const),
    );
    let written = 0;
    let skipped = 0;
    this.ctx.storage.transactionSync(() => {
      for (const row of input.rows) {
        const p = roster.get(row.participationId);
        const role = p?.role as AudienceRole | undefined;
        if (!p || (role !== 'traveler' && role !== 'leader' && role !== 'guardian')) {
          skipped += 1;
          continue;
        }
        const lane = laneFor(role, input.kind, {});
        if (!lane) {
          skipped += 1;
          continue;
        }
        const exists = sql
          .exec<{ n: number }>(
            'SELECT COUNT(*) AS n FROM notifications WHERE trip_id = ? AND participation_id = ? AND kind = ? AND ref_id = ?',
            input.tripId,
            p.id,
            input.kind,
            input.refId,
          )
          .one().n;
        if (exists > 0) {
          skipped += 1;
          continue;
        }
        sql.exec(
          `INSERT INTO notifications (id, trip_id, participation_id, lane, kind, title, body, ref_type, ref_id, created_at, deliver_at, read_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          crypto.randomUUID(),
          input.tripId,
          p.id,
          lane,
          input.kind,
          input.title,
          row.body,
          input.refType,
          input.refId,
          input.now,
          deliverAt(lane, input.now, input.timeZone, input.quietHours, input.digestAt),
        );
        written += 1;
      }
    });
    return { written, skipped };
  }

  /**
   * Who still has packing to do (slice 056): every traveler and leader whose own list over the
   * current items is not complete, with the names of what is missing, and the guardians bound
   * to those travelers. Empty while the trip has no items.
   */
  async packingReminderTargets(tripId: string): Promise<PackingReminderTarget[]> {
    this.requireOrg();
    const items = this.packingItemsOf(tripId);
    if (items.length === 0) return [];
    const sql = this.ctx.storage.sql;
    const roster = sql
      .exec<ParticipationRow>('SELECT * FROM participations WHERE trip_id = ?', tripId)
      .toArray();
    const itemIds = new Set(items.map((i) => i.id));
    const ticks = sql
      .exec<PackingTickRow>('SELECT * FROM packing_ticks WHERE trip_id = ?', tripId)
      .toArray()
      .filter((t) => itemIds.has(t.item_id));
    const out: PackingReminderTarget[] = [];
    const packers = roster.filter((p) => p.role === 'traveler' || p.role === 'leader');
    for (const p of packers) {
      const done = new Set(ticks.filter((t) => t.participation_id === p.id).map((t) => t.item_id));
      const missing = items.filter((i) => !done.has(i.id)).map((i) => i.name);
      if (missing.length === 0) continue;
      out.push({
        participationId: p.id,
        role: p.role as 'traveler' | 'leader',
        displayName: p.display_name,
        forTraveler: null,
        packed: items.length - missing.length,
        total: items.length,
        missing,
      });
      if (p.role === 'traveler') {
        for (const g of roster.filter((r) => r.role === 'guardian' && r.guardian_of === p.id)) {
          out.push({
            participationId: g.id,
            role: 'guardian',
            displayName: g.display_name,
            forTraveler: p.display_name,
            packed: items.length - missing.length,
            total: items.length,
            missing,
          });
        }
      }
    }
    return out;
  }

  /** The caller's inbox: what has been delivered by `now`, newest first, with the unread count. */
  async myNotifications(
    tripId: string,
    participationId: string,
    now: string,
  ): Promise<MyNotifications> {
    this.requireOrg();
    const rows = this.ctx.storage.sql
      .exec<NotificationRow>(
        'SELECT * FROM notifications WHERE trip_id = ? AND participation_id = ? AND deliver_at <= ? ORDER BY deliver_at DESC, id LIMIT 100',
        tripId,
        participationId,
        now,
      )
      .toArray();
    return {
      notifications: rows.map((r) => this.notificationOf(r)),
      unread: rows.filter((r) => r.read_at === null).length,
    };
  }

  async markNotificationRead(
    tripId: string,
    participationId: string,
    id: string,
    now: string,
  ): Promise<Notification | { notFound: true }> {
    this.requireOrg();
    const row =
      this.ctx.storage.sql
        .exec<NotificationRow>(
          'SELECT * FROM notifications WHERE id = ? AND trip_id = ? AND participation_id = ?',
          id,
          tripId,
          participationId,
        )
        .toArray()[0] ?? null;
    if (!row) return { notFound: true };
    const next: NotificationRow = { ...row, read_at: row.read_at ?? now };
    this.ctx.storage.sql.exec(
      'UPDATE notifications SET read_at = ? WHERE id = ?',
      next.read_at,
      id,
    );
    return this.notificationOf(next);
  }

  /** The organizer's log: the last fifty events, each with its lane counts and what still waits. */
  async notificationLog(
    tripId: string,
    now: string,
  ): Promise<NotificationLog | { notFound: true }> {
    this.requireOrg();
    if (!(await this.getTrip(tripId))) return { notFound: true };
    const rows = this.ctx.storage.sql
      .exec<NotificationRow>(
        'SELECT * FROM notifications WHERE trip_id = ? ORDER BY created_at DESC, id',
        tripId,
      )
      .toArray();
    const events = new Map<string, NotificationEvent>();
    for (const r of rows) {
      const key = `${r.created_at}|${r.ref_type}|${r.ref_id}|${r.kind}`;
      let e = events.get(key);
      if (!e) {
        if (events.size >= 50) continue;
        e = {
          createdAt: r.created_at,
          kind: r.kind as NotificationEvent['kind'],
          title: r.title,
          refType: r.ref_type as NotificationEvent['refType'],
          refId: r.ref_id,
          lanes: { priority: 0, normal: 0, digest: 0 },
          held: 0,
          emailed: 0,
          recipients: 0,
        };
        events.set(key, e);
      }
      e.lanes[
        r.lane as NotificationEvent['lanes'] extends infer _
          ? 'priority' | 'normal' | 'digest'
          : never
      ] += 1;
      e.recipients += 1;
      if (r.lane === 'normal' && r.deliver_at > now) e.held += 1;
      if (r.lane === 'digest' && r.digest_outcome === 'emailed') e.emailed += 1;
    }
    return { events: [...events.values()] };
  }

  /**
   * The digest-lane rows due by `now` that no email has carried yet, grouped per recipient with
   * the trip they belong to (slice 054). The cron turns each group into one email and marks the
   * rows; a recipient who has not joined yet has no account and keeps the rows in the inbox.
   */
  async dueDigests(now: string): Promise<DueDigest[]> {
    this.requireOrg();
    const rows = this.ctx.storage.sql
      .exec<NotificationRow & { account_id: string | null; display_name: string }>(
        `SELECT n.*, p.account_id, p.display_name FROM notifications n
         JOIN participations p ON p.id = n.participation_id
         WHERE n.lane = 'digest' AND n.deliver_at <= ? AND n.digested_at IS NULL
         ORDER BY n.participation_id, n.created_at, n.id`,
        now,
      )
      .toArray();
    const trips = new Map<string, Trip | null>();
    const groups = new Map<string, DueDigest>();
    for (const r of rows) {
      if (!trips.has(r.trip_id)) trips.set(r.trip_id, await this.getTrip(r.trip_id));
      const trip = trips.get(r.trip_id);
      if (!trip) continue;
      let g = groups.get(r.participation_id);
      if (!g) {
        g = {
          tripId: r.trip_id,
          tripName: trip.name,
          timeZone: trip.timezone,
          participationId: r.participation_id,
          accountId: r.account_id,
          displayName: r.display_name,
          items: [],
        };
        groups.set(r.participation_id, g);
      }
      g.items.push({
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        createdAt: r.created_at,
      });
    }
    return [...groups.values()];
  }

  /** Marks digest rows as taken by the run at `now` (emailed, or skipped); returns how many changed. */
  async markDigested(ids: string[], now: string, outcome: 'emailed' | 'skipped'): Promise<number> {
    this.requireOrg();
    let changed = 0;
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      for (const id of ids) {
        changed += sql.exec(
          'UPDATE notifications SET digested_at = ?, digest_outcome = ? WHERE id = ? AND digested_at IS NULL',
          now,
          outcome,
          id,
        ).rowsWritten;
      }
    });
    return changed;
  }

  async personTimeline(tripId: string, participationId: string): Promise<TimelineEntry[] | null> {
    this.requireOrg();
    const me = await this.getParticipation(participationId);
    if (!me || me.tripId !== tripId) return null;
    const sql = this.ctx.storage.sql;
    const entries: TimelineEntry[] = [];
    // Facts recorded on the row itself (slice 031): devices revoked by the organizer.
    for (const r of sql
      .exec<{ kind: string; by_name: string; detail: string | null; at: string }>(
        'SELECT kind, by_name, detail, at FROM participation_events WHERE participation_id = ?',
        participationId,
      )
      .toArray()) {
      if (r.kind === 'devices_revoked') {
        entries.push({
          kind: 'devices_revoked',
          at: r.at,
          title: `Devices revoked by ${r.by_name}`,
          detail: 'Every phone signed out; a new invite code was issued.',
          ref: null,
        });
      } else if (r.kind === 'document_reveal') {
        // Slice 045 (D27): every scan reveal, naming the document.
        let name = r.detail ?? '';
        try {
          name = (JSON.parse(r.detail ?? '{}') as { name?: string }).name ?? name;
        } catch {
          /* an older free-text detail stays as it is */
        }
        entries.push({
          kind: 'document_reveal',
          at: r.at,
          title: `Document scan revealed by ${r.by_name}`,
          detail: name || null,
          ref: null,
        });
      } else if (r.kind === 'chat_audited_read') {
        // Slice 064 (D22): the organizer read a channel this person is in, on an open incident.
        let d: { title?: string; incidentId?: string; incidentTitle?: string } = {};
        try {
          d = JSON.parse(r.detail ?? '{}') as typeof d;
        } catch {
          /* keep the empty detail */
        }
        entries.push({
          kind: 'chat_audited_read',
          at: r.at,
          title: `Channel "${d.title ?? ''}" read by ${r.by_name} (audited)`,
          detail: d.incidentTitle ? `During the incident: ${d.incidentTitle}` : null,
          ref: d.incidentId ? { type: 'incident', id: d.incidentId } : null,
        });
      }
    }
    // Care note (D27): the latest write and every audited reveal; never the content.
    for (const r of sql
      .exec<CareNoteRow>('SELECT * FROM care_notes WHERE participation_id = ?', participationId)
      .toArray()) {
      entries.push({
        kind: 'care_update',
        at: r.updated_at,
        title: `Care note updated by ${r.updated_by_role} ${r.updated_by_name}`,
        detail: null,
        ref: null,
      });
    }
    for (const r of sql
      .exec<{ revealed_by_name: string; revealed_by_role: string; revealed_at: string }>(
        'SELECT revealed_by_name, revealed_by_role, revealed_at FROM care_reveals WHERE participation_id = ?',
        participationId,
      )
      .toArray()) {
      entries.push({
        kind: 'care_reveal',
        at: r.revealed_at,
        title: `Care note revealed by ${r.revealed_by_role} ${r.revealed_by_name}`,
        detail: null,
        ref: null,
      });
    }
    // Photos (D18, slice 043): every album photo a leader tagged this person in.
    for (const r of sql
      .exec<PhotoRow>(
        'SELECT * FROM photos WHERE trip_id = ? AND album_at IS NOT NULL AND instr(album_tags, ?) > 0',
        tripId,
        JSON.stringify(participationId),
      )
      .toArray()) {
      entries.push({
        kind: 'photo_tag',
        at: r.album_at ?? r.uploaded_at,
        title: `Tagged in an album photo by ${r.album_by_name ?? 'a leader'}`,
        detail: `Day ${r.day}, uploaded by ${r.uploader_name}`,
        ref: { type: 'photo', id: r.id },
      });
    }
    for (const r of sql
      .exec<{
        announcement_id: string;
        acked_at_device: string;
        received_at: string;
        title: string;
      }>(
        `SELECT a.announcement_id, a.acked_at_device, a.received_at, n.title
         FROM acks a JOIN announcements n ON n.id = a.announcement_id WHERE a.participation_id = ?`,
        participationId,
      )
      .toArray()) {
      entries.push({
        kind: 'ack',
        at: r.received_at,
        title: `Acknowledged: ${r.title}`,
        detail: `On the device at ${r.acked_at_device}`,
        ref: { type: 'announcement', id: r.announcement_id },
      });
    }
    if (me.role === 'traveler') {
      for (const r of sql
        .exec<{
          id: string;
          group_name: string | null;
          opened_by_name: string;
          opened_at_device: string;
          closed_at_device: string | null;
          received_at: string;
          mark: string | null;
        }>(
          `SELECT h.id, h.group_name, h.opened_by_name, h.opened_at_device, h.closed_at_device, h.received_at, m.mark
           FROM headcounts h LEFT JOIN headcount_marks m ON m.headcount_id = h.id AND m.participation_id = ?
           WHERE h.trip_id = ? AND (h.group_name IS NULL OR h.group_name = ?)`,
          participationId,
          tripId,
          me.groupName ?? '',
        )
        .toArray()) {
        const mark = r.mark ?? (r.closed_at_device ? 'missing' : 'not counted');
        entries.push({
          kind: 'headcount',
          at: r.received_at,
          title: `Head count · ${r.group_name ?? 'Whole trip'} · ${mark.replaceAll('_', ' ')}`,
          detail: `Opened ${r.opened_at_device} by ${r.opened_by_name}${r.closed_at_device ? ` · closed ${r.closed_at_device}` : ' · open'}`,
          ref: { type: 'headcount', id: r.id },
        });
      }
    } else {
      for (const r of sql
        .exec<{
          id: string;
          group_name: string | null;
          opened_at_device: string;
          closed_at_device: string | null;
          received_at: string;
        }>(
          'SELECT id, group_name, opened_at_device, closed_at_device, received_at FROM headcounts WHERE trip_id = ? AND opened_by_participation_id = ?',
          tripId,
          participationId,
        )
        .toArray()) {
        entries.push({
          kind: 'headcount',
          at: r.received_at,
          title: `Opened head count · ${r.group_name ?? 'Whole trip'}`,
          detail: `${r.opened_at_device}${r.closed_at_device ? ` · closed ${r.closed_at_device}` : ' · still open'}`,
          ref: { type: 'headcount', id: r.id },
        });
      }
    }
    for (const r of sql
      .exec<IncidentRow>(
        `SELECT i.* FROM incidents i JOIN incident_people p ON p.incident_id = i.id WHERE i.trip_id = ? AND p.participation_id = ?`,
        tripId,
        participationId,
      )
      .toArray()) {
      entries.push({
        kind: 'incident',
        at: r.opened_at,
        title: `Incident opened: ${r.title}`,
        detail: `By ${r.opened_by_name}`,
        ref: { type: 'incident', id: r.id },
      });
      if (r.resolved_at) {
        entries.push({
          kind: 'incident',
          at: r.resolved_at,
          title: 'Incident resolved',
          detail: [r.resolved_by_name, r.resolution_note].filter(Boolean).join(' · ') || null,
          ref: { type: 'incident', id: r.id },
        });
      }
      if (r.guardian_message_sent_at && r.guardian_message_en) {
        entries.push({
          kind: 'guardian_message',
          at: r.guardian_message_sent_at,
          title: `Guardian message sent by ${r.guardian_message_by_name ?? 'Organizer'}`,
          detail: r.guardian_message_en,
          ref: { type: 'incident', id: r.id },
        });
      }
    }
    for (const r of sql
      .exec<{
        incident_id: string;
        status: string;
        note: string | null;
        confirmed_at: string;
        title: string;
      }>(
        `SELECT c.incident_id, c.status, c.note, c.confirmed_at, i.title FROM incident_confirmations c
         JOIN incidents i ON i.id = c.incident_id WHERE i.trip_id = ? AND c.by_participation_id = ?`,
        tripId,
        participationId,
      )
      .toArray()) {
      entries.push({
        kind: 'confirmation',
        at: r.confirmed_at,
        title: `Confirmed ${r.status.replaceAll('_', ' ')}: ${r.title}`,
        detail: r.note,
        ref: { type: 'incident', id: r.incident_id },
      });
    }
    entries.sort((a, b) => b.at.localeCompare(a.at));
    return entries.slice(0, 200);
  }

  /** Guardians bound to a traveler (slice 026). */
  async guardiansOf(tripId: string, travelerId: string): Promise<Participation[]> {
    this.requireOrg();
    return this.ctx.storage.sql
      .exec<ParticipationRow>(
        'SELECT * FROM participations WHERE trip_id = ? AND guardian_of = ? ORDER BY display_name',
        tripId,
        travelerId,
      )
      .toArray()
      .map((r) => this.participationFromRow(r));
  }

  /* ---------- Itinerary (slice 017) ---------- */

  private itineraryEventFromRow(r: ItineraryEventRow): ItineraryEvent {
    return {
      id: r.id,
      tripId: r.trip_id,
      date: r.date,
      start: r.start,
      end: r.end,
      timeZone: r.time_zone,
      kind: r.kind as ItineraryEvent['kind'],
      title: r.title,
      place: r.place,
      pax: r.pax,
      status: r.status as ItineraryEvent['status'],
      note: r.note,
      order: r.sort_order,
      published: r.published === 1,
    };
  }

  /** The published revisions of a trip, newest first, each with its stored diff (slice 057). */
  async listRevisions(tripId: string): Promise<ItineraryRevision[] | { notFound: true }> {
    this.requireOrg();
    if (!(await this.getTrip(tripId))) return { notFound: true };
    return this.ctx.storage.sql
      .exec<RevisionRow>(
        'SELECT * FROM itinerary_revisions WHERE trip_id = ? ORDER BY revision DESC',
        tripId,
      )
      .toArray()
      .map((r) => this.revisionOf(r));
  }

  /** One revision with the events exactly as they were published (slice 057). */
  async getRevision(
    tripId: string,
    revision: number,
  ): Promise<ItineraryRevisionDetail | { notFound: true }> {
    this.requireOrg();
    const r =
      this.ctx.storage.sql
        .exec<RevisionRow>(
          'SELECT * FROM itinerary_revisions WHERE trip_id = ? AND revision = ?',
          tripId,
          revision,
        )
        .toArray()[0] ?? null;
    if (!r) return { notFound: true };
    return { ...this.revisionOf(r), snapshot: JSON.parse(r.snapshot) as ItineraryEvent[] };
  }

  private revisionOf(r: RevisionRow): ItineraryRevision {
    return {
      revision: r.revision,
      publishedAt: r.published_at,
      publishedByName: r.published_by_name,
      summary: this.revisionSummary(r.trip_id, r.revision),
      events: (JSON.parse(r.snapshot) as unknown[]).length,
    };
  }

  private latestRevision(tripId: string): RevisionRow | null {
    return (
      this.ctx.storage.sql
        .exec<RevisionRow>(
          'SELECT * FROM itinerary_revisions WHERE trip_id = ? ORDER BY revision DESC LIMIT 1',
          tripId,
        )
        .toArray()[0] ?? null
    );
  }

  private draftEvents(tripId: string): ItineraryEvent[] {
    return this.ctx.storage.sql
      .exec<ItineraryEventRow>(
        'SELECT * FROM itinerary_events WHERE trip_id = ? ORDER BY date, sort_order, start',
        tripId,
      )
      .toArray()
      .map((r) => this.itineraryEventFromRow(r));
  }

  /**
   * The itinerary as one viewer sees it. `draft`: the working rows with an unpublished count
   * (edited or added rows, plus rows removed since the last revision). `published`: the latest
   * revision's snapshot, or no events before the first publish. Days span the trip's dates.
   */
  async getItinerary(tripId: string, view: 'draft' | 'published'): Promise<Itinerary | null> {
    this.requireOrg();
    const trip = await this.getTrip(tripId);
    if (!trip) return null;
    const latest = this.latestRevision(tripId);
    const snapshot: ItineraryEvent[] = latest
      ? (JSON.parse(latest.snapshot) as ItineraryEvent[])
      : [];
    const draft = this.draftEvents(tripId);
    const events = view === 'draft' ? draft : snapshot;
    const draftIds = new Set(draft.map((e) => e.id));
    const removed = snapshot.filter((e) => !draftIds.has(e.id)).length;
    const unpublished = view === 'draft' ? draft.filter((e) => !e.published).length + removed : 0;
    const days = datesBetween(trip.startsOn, trip.endsOn).map((date, i) => ({
      date,
      timeZone: trip.timezone,
      label: `Day ${i + 1}`,
    }));
    return {
      tripId,
      tripName: trip.name,
      startDate: trip.startsOn,
      endDate: trip.endsOn,
      revision: latest?.revision ?? 0,
      publishedAt: latest?.published_at ?? null,
      view,
      days,
      events,
      unpublished,
    };
  }

  /** Create or replace a draft event (client-minted id). The row is unpublished until the next publish. */
  async upsertItineraryEvent(
    tripId: string,
    id: string,
    input: ItineraryEventInput,
  ): Promise<ItineraryEvent | { otherTrip: true } | { notFound: true }> {
    this.requireOrg();
    if (!(await this.getTrip(tripId))) return { notFound: true };
    const sql = this.ctx.storage.sql;
    const existing = sql
      .exec<{ trip_id: string }>('SELECT trip_id FROM itinerary_events WHERE id = ?', id)
      .toArray()[0];
    if (existing && existing.trip_id !== tripId) return { otherTrip: true };
    sql.exec(
      `INSERT INTO itinerary_events
        (id, trip_id, date, start, end, time_zone, kind, title, place, pax, status, note, sort_order, published, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(id) DO UPDATE SET
         date = excluded.date, start = excluded.start, end = excluded.end, time_zone = excluded.time_zone,
         kind = excluded.kind, title = excluded.title, place = excluded.place, pax = excluded.pax,
         status = excluded.status, note = excluded.note, sort_order = excluded.sort_order,
         published = 0, updated_at = excluded.updated_at`,
      id,
      tripId,
      input.date,
      input.start,
      input.end,
      input.timeZone,
      input.kind,
      input.title,
      input.place,
      input.pax,
      input.status,
      input.note,
      input.order,
      nowIso(),
    );
    const row = sql
      .exec<ItineraryEventRow>('SELECT * FROM itinerary_events WHERE id = ?', id)
      .one();
    return this.itineraryEventFromRow(row);
  }

  /** Remove a draft event. Its absence from the next snapshot is the published removal. */
  async deleteItineraryEvent(tripId: string, id: string): Promise<boolean> {
    this.requireOrg();
    const sql = this.ctx.storage.sql;
    const existing = sql
      .exec<{ id: string }>(
        'SELECT id FROM itinerary_events WHERE id = ? AND trip_id = ?',
        id,
        tripId,
      )
      .toArray()[0];
    if (!existing) return false;
    sql.exec('DELETE FROM itinerary_events WHERE id = ?', id);
    return true;
  }

  /**
   * Snapshot the draft as revision n+1 and mark every row published. `expectedRevision` must be
   * the current one (optimistic concurrency, doc 01 §11.3): a stale editor gets `conflict`.
   */
  async publishItinerary(
    tripId: string,
    expectedRevision: number,
    byName: string,
    options: {
      /** Open the required-ack announcement (D19) when the diff touches `today` or later. */
      notify: boolean;
      note: string | null;
      /** Today's calendar date in the trip's zone, decided by the Worker. */
      today: string;
      /** The organization's default locale picks the primary body; the other is the translation. */
      locale: 'ko' | 'en';
    } = { notify: false, note: null, today: '0000-00-00', locale: 'en' },
  ): Promise<
    | { itinerary: Itinerary; announcementId: string | null; diff: RevisionSummary }
    | { conflict: number }
    | { notFound: true }
    | { nothing: true }
  > {
    this.requireOrg();
    const current = await this.getItinerary(tripId, 'draft');
    if (!current) return { notFound: true };
    if (current.revision !== expectedRevision) return { conflict: current.revision };
    if (current.unpublished === 0 && current.revision > 0) return { nothing: true };
    const next = current.revision + 1;
    const published = current.events.map((e) => ({ ...e, published: true }));
    const previous = this.latestRevision(tripId);
    const previousEvents: ItineraryEvent[] = previous
      ? (JSON.parse(previous.snapshot) as ItineraryEvent[])
      : [];
    const dayIndex = new Map(current.days.map((d, i) => [d.date, i + 1]));
    const summary = diffRevisions(previousEvents, published, (date) => dayIndex.get(date) ?? 0);
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      sql.exec(
        'INSERT INTO itinerary_revisions (trip_id, revision, published_at, published_by_name, snapshot, diff) VALUES (?, ?, ?, ?, ?, ?)',
        tripId,
        next,
        nowIso(),
        byName,
        JSON.stringify(published),
        JSON.stringify(summary),
      );
      sql.exec('UPDATE itinerary_events SET published = 1 WHERE trip_id = ?', tripId);
    });
    // D19: everyone gets the diff with a required ack. Not for the first publish (the plan itself),
    // not when the organizer publishes quietly, and not when only past days changed.
    const touchesCurrentDays = summary.changes.some((c) => c.date >= options.today);
    let announcementId: string | null = null;
    if (options.notify && next >= 2 && summary.changes.length > 0 && touchesCurrentDays) {
      const body = composeRevisionBody(summary, options.note);
      const primary = options.locale === 'ko' ? body.ko : body.en;
      const other = options.locale === 'ko' ? body.en : body.ko;
      const created = await this.createAnnouncement({
        tripId,
        title: options.locale === 'ko' ? body.title.ko : body.title.en,
        body: primary,
        requiresAck: true,
        sharedWithGuardians: true,
        authorParticipationId: null,
        authorName: byName,
        translation: {
          locale: options.locale === 'ko' ? 'en' : 'ko',
          body: other,
          provider: 'system',
          editedBy: null,
        },
        kind: 'itinerary_revision',
        revision: next,
      });
      announcementId = created.id;
    }
    const itinerary = await this.getItinerary(tripId, 'draft');
    return {
      itinerary: itinerary as Itinerary,
      announcementId,
      diff: { revision: next, fromRevision: next - 1, ...summary },
    };
  }

  /* ---------- Leader change proposals (slice 018) ---------- */

  private proposalFromRow(r: ProposalRow): ItineraryProposal {
    return {
      id: r.id,
      tripId: r.trip_id,
      kind: r.kind as ItineraryProposal['kind'],
      eventId: r.event_id,
      eventTitle: r.event_title,
      patch: JSON.parse(r.patch) as ItineraryProposal['patch'],
      note: r.note,
      status: r.status as ItineraryProposal['status'],
      proposedByName: r.proposed_by_name,
      proposedAt: r.proposed_at,
      decidedAt: r.decided_at,
      decidedByName: r.decided_by_name,
      decisionNote: r.decision_note,
    };
  }

  /** File a proposal. `edit` and `remove` need an existing draft event; `add` needs a full event. */
  async createProposal(input: {
    tripId: string;
    kind: 'edit' | 'add' | 'remove';
    eventId: string | null;
    patch: ItineraryProposal['patch'];
    note: string;
    byParticipationId: string | null;
    byName: string;
  }): Promise<
    | { proposal: ItineraryProposal }
    | { notFound: true }
    | { eventNotFound: true }
    | { incomplete: true }
  > {
    this.requireOrg();
    if (!(await this.getTrip(input.tripId))) return { notFound: true };
    const sql = this.ctx.storage.sql;
    let title: string | null = null;
    if (input.kind !== 'add') {
      if (!input.eventId) return { eventNotFound: true };
      const ev = sql
        .exec<ItineraryEventRow>(
          'SELECT * FROM itinerary_events WHERE id = ? AND trip_id = ?',
          input.eventId,
          input.tripId,
        )
        .toArray()[0];
      if (!ev) return { eventNotFound: true };
      title = ev.title;
    } else if (!isCompleteEvent(input.patch)) {
      return { incomplete: true };
    }
    const id = crypto.randomUUID();
    sql.exec(
      `INSERT INTO itinerary_proposals
        (id, trip_id, kind, event_id, event_title, patch, note, status, proposed_by_participation_id, proposed_by_name, proposed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      id,
      input.tripId,
      input.kind,
      input.kind === 'add' ? null : input.eventId,
      title ?? (typeof input.patch.title === 'string' ? input.patch.title : null),
      JSON.stringify(input.patch),
      input.note,
      input.byParticipationId,
      input.byName,
      nowIso(),
    );
    const row = sql.exec<ProposalRow>('SELECT * FROM itinerary_proposals WHERE id = ?', id).one();
    return { proposal: this.proposalFromRow(row) };
  }

  /** Pending first, newest first within a status. */
  async listProposals(tripId: string): Promise<ItineraryProposal[]> {
    this.requireOrg();
    return this.ctx.storage.sql
      .exec<ProposalRow>(
        `SELECT * FROM itinerary_proposals WHERE trip_id = ?
          ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, proposed_at DESC`,
        tripId,
      )
      .toArray()
      .map((r) => this.proposalFromRow(r));
  }

  /**
   * Accept applies the proposal to the draft (an edit merges the patch, an add inserts a row,
   * a remove deletes the row) and the organizer publishes as usual; reject records the reason.
   * A proposal already decided answers `decided`; an edit whose event vanished answers `gone`.
   */
  async decideProposal(input: {
    tripId: string;
    proposalId: string;
    decision: 'accept' | 'reject';
    note: string | null;
    byName: string;
  }): Promise<
    | { proposal: ItineraryProposal; proposerId: string | null }
    | { notFound: true }
    | { decided: true }
    | { gone: true }
  > {
    this.requireOrg();
    const sql = this.ctx.storage.sql;
    const row = sql
      .exec<ProposalRow>(
        'SELECT * FROM itinerary_proposals WHERE id = ? AND trip_id = ?',
        input.proposalId,
        input.tripId,
      )
      .toArray()[0];
    if (!row) return { notFound: true };
    if (row.status !== 'pending') return { decided: true };
    const proposal = this.proposalFromRow(row);
    if (input.decision === 'accept') {
      if (proposal.kind === 'add') {
        if (!isCompleteEvent(proposal.patch)) return { gone: true };
        await this.upsertItineraryEvent(input.tripId, crypto.randomUUID(), proposal.patch);
      } else {
        const ev = proposal.eventId
          ? sql
              .exec<ItineraryEventRow>(
                'SELECT * FROM itinerary_events WHERE id = ? AND trip_id = ?',
                proposal.eventId,
                input.tripId,
              )
              .toArray()[0]
          : undefined;
        if (!ev) return { gone: true };
        if (proposal.kind === 'remove') {
          sql.exec('DELETE FROM itinerary_events WHERE id = ?', ev.id);
        } else {
          const current = this.itineraryEventFromRow(ev);
          const merged: ItineraryEventInput = {
            date: proposal.patch.date ?? current.date,
            start: proposal.patch.start ?? current.start,
            end: proposal.patch.end === undefined ? current.end : proposal.patch.end,
            timeZone: proposal.patch.timeZone ?? current.timeZone,
            kind: proposal.patch.kind ?? current.kind,
            title: proposal.patch.title ?? current.title,
            place: proposal.patch.place ?? current.place,
            pax: proposal.patch.pax === undefined ? current.pax : proposal.patch.pax,
            status: proposal.patch.status ?? current.status,
            note: proposal.patch.note === undefined ? current.note : proposal.patch.note,
            order: proposal.patch.order ?? current.order,
          };
          await this.upsertItineraryEvent(input.tripId, ev.id, merged);
        }
      }
    }
    sql.exec(
      `UPDATE itinerary_proposals SET status = ?, decided_at = ?, decided_by_name = ?, decision_note = ? WHERE id = ?`,
      input.decision === 'accept' ? 'accepted' : 'rejected',
      nowIso(),
      input.byName,
      input.note,
      input.proposalId,
    );
    const updated = sql
      .exec<ProposalRow>('SELECT * FROM itinerary_proposals WHERE id = ?', input.proposalId)
      .one();
    return {
      proposerId: row.proposed_by_participation_id,
      proposal: this.proposalFromRow(updated),
    };
  }
}
