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
import type { AckStatus, Announcement, Participation, Trip, TripRole } from '@voysemble/contracts';
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
];

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
    };
    this.ctx.storage.sql.exec(
      `INSERT INTO announcements
        (id, trip_id, title, body, requires_ack, shared_with_guardians, author_participation_id, author_name, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.trip_id,
      row.title,
      row.body,
      row.requires_ack,
      row.shared_with_guardians,
      row.author_participation_id,
      row.author_name,
      row.published_at,
    );
    return this.announcementFromRow(row, input.authorParticipationId);
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
}
