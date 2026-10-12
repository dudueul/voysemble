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

  it('is empty and honest for an empty roster', () => {
    expect(buildPeople([])).toEqual({
      rows: [],
      groups: [],
      totals: { travelers: 0, guardians: 0, leaders: 0, joined: 0, notJoined: 0 },
    });
  });
});
