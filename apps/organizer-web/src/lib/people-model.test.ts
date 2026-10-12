// Copyright 2026- At Day. All rights reserved.
// Facts: invite status maps to the page's join status; guardians resolve their traveler's name;
// totals and group chips derive from the roster; a care note is never invented.

import type { RosterEntry } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { buildPeople } from './people-model';

function entry(
  partial: Partial<RosterEntry> & Pick<RosterEntry, 'id' | 'displayName' | 'role'>,
): RosterEntry {
  return {
    tripId: 't1',
    groupName: null,
    guardianOf: null,
    accountId: null,
    createdAt: '2026-10-12T00:00:00.000Z',
    invite: 'none',
    lastAckAt: null,
    hasCareNote: false,
    ...partial,
  };
}

describe('buildPeople', () => {
  it('maps invite status, resolves guardian bindings, and counts', () => {
    const model = buildPeople([
      entry({
        id: 'p1',
        displayName: 'Minji Park',
        role: 'traveler',
        groupName: 'Bus A',
        invite: 'joined',
        accountId: 'a1',
        lastAckAt: '2026-10-12T01:00:00.000Z',
      }),
      entry({
        id: 'p2',
        displayName: 'Sora Park',
        role: 'guardian',
        groupName: 'Bus A',
        guardianOf: 'p1',
        invite: 'issued',
      }),
      entry({
        id: 'p3',
        displayName: 'Juho Kim',
        role: 'traveler',
        groupName: 'Bus B',
        invite: 'expired',
      }),
      entry({ id: 'p4', displayName: 'Kim', role: 'leader', groupName: 'Bus A' }),
    ]);
    expect(model.rows.map((r) => r.status)).toEqual(['joined', 'invited', 'expired', 'pending']);
    expect(model.rows[1]?.guardianOfName).toBe('Minji Park');
    expect(model.rows[0]?.lastAckAt).toBe('2026-10-12T01:00:00.000Z');
    expect(model.rows.every((r) => r.hasCareNote === false)).toBe(true);
    expect(model.groups).toEqual(['Bus A', 'Bus B']);
    expect(model.totals).toEqual({
      travelers: 2,
      guardians: 1,
      leaders: 1,
      joined: 1,
      notJoined: 3,
    });
  });

  it('attaches the fee column to travelers when a ledger is given (slice 066)', () => {
    const entry = (
      id: string,
      role: string,
      displayName: string,
      groupName: string,
      guardianOf: string | null,
    ) => ({
      id,
      role,
      displayName,
      groupName,
      guardianOf,
      invite: 'none',
      lastAckAt: null,
      tripId: 't',
      accountId: null,
      createdAt: 'x',
    });
    const entries = [
      entry('p1', 'traveler', 'Minji Park', 'Bus A', null),
      entry('p2', 'guardian', 'Sora Park', 'Bus A', 'p1'),
      entry('p3', 'traveler', 'Juho Kim', 'Bus B', null),
    ] as never[];
    const ledger = {
      currency: 'KRW',
      withoutFee: 1,
      totals: {
        expectedMinor: 450000,
        collectedMinor: 200000,
        refundedMinor: 0,
        paid: 0,
        partial: 1,
        unpaid: 0,
        refunded: 0,
      },
      rows: [
        {
          participationId: 'p1',
          displayName: 'Minji Park',
          groupName: 'Bus A',
          currency: 'KRW',
          amountDueMinor: 450000,
          paidMinor: 200000,
          refundedMinor: 0,
          dueOn: null,
          note: null,
          status: 'partial',
          updatedAt: 'x',
          updatedByName: 'Owner',
        },
      ],
    } as never;
    const without = buildPeople(entries);
    expect(without.fees).toBe(false);
    expect(without.rows[0]?.fee).toBeUndefined();
    const withFees = buildPeople(entries, ledger);
    expect(withFees.fees).toBe(true);
    expect(withFees.rows[0]?.fee).toEqual({
      status: 'partial',
      currency: 'KRW',
      balanceMinor: 250000,
    });
    expect(withFees.rows[1]?.fee).toBeUndefined();
    expect(withFees.rows[2]?.fee).toBeNull();
  });

  it('is empty and honest for an empty roster', () => {
    expect(buildPeople([])).toEqual({
      rows: [],
      groups: [],
      totals: { travelers: 0, guardians: 0, leaders: 0, joined: 0, notJoined: 0 },
      fees: false,
    });
  });
});
