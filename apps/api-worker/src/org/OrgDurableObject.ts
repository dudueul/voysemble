// Copyright 2026- At Day. All rights reserved.
//
// OrgDurableObject: the canonical, single-threaded store for one organization (ADR-0002).
// One instance per organization, addressed by `idFromName(organizationId)`.
//
// Owns: trips, participations (roster rows), and from later slices itineraries, announcements,
// acks, head counts, incidents, photos metadata, ledger, org audit.
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
  GuardianStatus,
  HeadcountMark,
  HeadcountSession,
  Incident,
  IncidentStatus,
  Itinerary,
  ItineraryEvent,
  ItineraryEventInput,
  ItineraryProposal,
  Participation,
  RevisionChange,
  RevisionSummary,
  TravelerCountStatus,
  Trip,
  TripRole,
} from '@voysemble/contracts';
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
];

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
  ): Promise<(Participation & { lastAckAt: string | null })[]> {
    this.requireOrg();
    return this.ctx.storage.sql
      .exec<ParticipationRow & { last_ack_at: string | null }>(
        `SELECT p.*, (SELECT MAX(a.received_at) FROM acks a WHERE a.participation_id = p.id) AS last_ack_at
         FROM participations p WHERE p.trip_id = ? ORDER BY p.group_name, p.role, p.display_name`,
        tripId,
      )
      .toArray()
      .map((r) => ({ ...this.participationFromRow(r), lastAckAt: r.last_ack_at }));
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
    | { session: HeadcountSession; applied: boolean; incidentId: string | null }
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
    const incidentId = session.closedWithMissing ? this.openHeadcountIncident(session) : null;
    return { session, applied: true, incidentId };
  }

  private incidentForHeadcount(headcountId: string): string | null {
    return (
      this.ctx.storage.sql
        .exec<{ id: string }>('SELECT id FROM incidents WHERE headcount_id = ?', headcountId)
        .toArray()[0]?.id ?? null
    );
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
   * Open cards first, newest first within a status. A guardian viewer gets only the cards
   * naming their traveler, projected (`guardianView`); staff get everything.
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
    };
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
    { proposal: ItineraryProposal } | { notFound: true } | { decided: true } | { gone: true }
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
    return { proposal: this.proposalFromRow(updated) };
  }
}
