// Copyright 2026- At Day. All rights reserved.
//
// People page on the API (slice 023): a pure mapping from roster entries to the rows and totals
// the page renders. Join status comes from the server's invite status (D12); the care-note
// column stays empty until D27 lands (never invented on the client).

import type { RosterEntry, TripRole } from '@voysemble/contracts';

export type JoinStatus = 'joined' | 'invited' | 'expired' | 'pending';

export interface PersonRow {
  id: string;
  name: string;
  role: TripRole;
  group: string | null;
  status: JoinStatus;
  /** Display name of the traveler a guardian is bound to. */
  guardianOfName: string | null;
  /** A sealed care note is on file (D27, slice 030); the content needs an audited reveal. */
  hasCareNote: boolean;
  lastAckAt: string | null;
}

export interface PeopleTotals {
  travelers: number;
  guardians: number;
  leaders: number;
  joined: number;
  notJoined: number;
}

export interface PeopleModel {
  rows: PersonRow[];
  /** Distinct group names in roster order, for the filter chips. */
  groups: string[];
  totals: PeopleTotals;
}

const STATUS: Record<RosterEntry['invite'], JoinStatus> = {
  joined: 'joined',
  issued: 'invited',
  expired: 'expired',
  none: 'pending',
};

/** The page's join status for a server invite status (also used on the person card's links). */
export function joinStatusOf(invite: RosterEntry['invite']): JoinStatus {
  return STATUS[invite];
}

export function buildPeople(entries: RosterEntry[]): PeopleModel {
  const names = new Map(entries.map((e) => [e.id, e.displayName]));
  const rows: PersonRow[] = entries.map((e) => ({
    id: e.id,
    name: e.displayName,
    role: e.role,
    group: e.groupName,
    status: STATUS[e.invite],
    guardianOfName: e.guardianOf ? (names.get(e.guardianOf) ?? null) : null,
    hasCareNote: e.hasCareNote ?? false,
    lastAckAt: e.lastAckAt,
  }));
  const groups: string[] = [];
  for (const e of entries)
    if (e.groupName && !groups.includes(e.groupName)) groups.push(e.groupName);
  const count = (role: TripRole) => entries.filter((e) => e.role === role).length;
  const joined = entries.filter((e) => e.invite === 'joined').length;
  return {
    rows,
    groups,
    totals: {
      travelers: count('traveler'),
      guardians: count('guardian'),
      leaders: count('leader'),
      joined,
      notJoined: entries.length - joined,
    },
  };
}
