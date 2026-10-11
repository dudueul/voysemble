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
import type { Participation, Trip, TripRole } from '@voysemble/contracts';
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
];

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
}
