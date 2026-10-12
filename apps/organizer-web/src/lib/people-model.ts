// Copyright 2026- At Day. All rights reserved.
//
// People page on the API (slice 023): a pure mapping from roster entries to the rows and totals
// the page renders. Join status comes from the server's invite status (D12); the care-note
// column stays empty until D27 lands (never invented on the client).

import type { Currency, FeeLedger, FeeStatus, RosterEntry, TripRole } from '@voysemble/contracts';

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
  /**
   * Slice 066 (D23): the traveler's fee from the ledger when the page has it; null for a traveler
   * without a fee row; absent for guardians and leaders, and when no ledger was given.
   */
  fee?: PersonFee | null;
}

export interface PersonFee {
  status: FeeStatus;
  currency: Currency;
  /** What is still owed: max(0, due − paid + refunded). */
  balanceMinor: number;
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
  /** True when the rows carry the fee column (a ledger was given; slice 066). */
  fees: boolean;
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

export function buildPeople(entries: RosterEntry[], ledger?: FeeLedger): PeopleModel {
  const names = new Map(entries.map((e) => [e.id, e.displayName]));
  const feeRows = new Map((ledger?.rows ?? []).map((r) => [r.participationId, r]));
  const feeOf = (e: RosterEntry): PersonFee | null => {
    const r = feeRows.get(e.id);
    if (!r) return null;
    return {
      status: r.status,
      currency: r.currency,
      balanceMinor: Math.max(0, r.amountDueMinor - r.paidMinor + r.refundedMinor),
    };
  };
  const rows: PersonRow[] = entries.map((e) => ({
    id: e.id,
    name: e.displayName,
    role: e.role,
    group: e.groupName,
    status: STATUS[e.invite],
    guardianOfName: e.guardianOf ? (names.get(e.guardianOf) ?? null) : null,
    hasCareNote: e.hasCareNote ?? false,
    lastAckAt: e.lastAckAt,
    ...(ledger && e.role === 'traveler' ? { fee: feeOf(e) } : {}),
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
    fees: ledger !== undefined,
  };
}
