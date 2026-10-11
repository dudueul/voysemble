// Copyright 2026- At Day. All rights reserved.
// Facts: trip status derives from dates; the active trip carries the traveler count; only
// ack-requiring announcements feed the rate; open incidents become red alerts naming people;
// the newest session per group wins and a short group reads as short; the result is live.

import type { HeadcountSession, Incident } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import {
  alertsFromIncidents,
  buildDashboard,
  destinationFromTimeZone,
  latestHeadcountGroups,
  organizerNameFrom,
  tripStatusOn,
} from './live-dashboard';

const NOW = '2026-12-31T06:12:00.000Z';
const ORG = {
  id: 'org_1',
  name: 'Seoul Arts High',
  defaultLocale: 'ko' as const,
  createdAt: NOW,
  role: 'owner' as const,
};
const TRIP = {
  id: 'trip_1',
  organizationId: 'org_1',
  name: 'Korea Concert Tour 2026',
  startsOn: '2026-12-28',
  endsOn: '2027-01-09',
  timezone: 'Europe/Rome',
  createdAt: NOW,
};
const session = (over: Partial<HeadcountSession>): HeadcountSession => ({
  id: '11111111-1111-4111-8111-111111111111',
  tripId: 'trip_1',
  groupName: 'Bus A',
  openedByName: 'Kim',
  openedAtDevice: '06:50',
  closedAtDevice: '06:58',
  receivedAt: '2026-12-31T05:58:00.000Z',
  expected: 2,
  present: 1,
  accounted: 1,
  missing: [],
  closedWithMissing: true,
  ...over,
});
const incident: Incident = {
  id: '55555555-5555-4555-8555-555555555555',
  tripId: 'trip_1',
  kind: 'headcount_missing',
  status: 'open',
  title: 'Head count closed with 1 missing (Bus A, 06:58)',
  headcountId: '11111111-1111-4111-8111-111111111111',
  people: [{ participationId: 'p2', displayName: 'Juho Kim', groupName: 'Bus A' }],
  openedAt: '2026-12-31T05:58:01.000Z',
  openedByName: 'Kim',
  resolvedAt: null,
  resolvedByName: null,
  resolutionNote: null,
  confirmations: [],
  guardianMessage: null,
};

describe('live dashboard mapping', () => {
  it('helpers: status by date, destination from zone, organizer from email', () => {
    expect(tripStatusOn(TRIP, '2026-12-01T00:00:00Z')).toBe('planning');
    expect(tripStatusOn(TRIP, NOW)).toBe('active');
    expect(tripStatusOn(TRIP, '2027-02-01T00:00:00Z')).toBe('completed');
    expect(destinationFromTimeZone('America/New_York')).toBe('New York');
    expect(organizerNameFrom('nate.kim@example.com')).toBe('Nate');
    expect(organizerNameFrom(undefined)).toBe('Organizer');
  });

  it('latest session per group wins; whole-trip sessions get their own label', () => {
    const groups = latestHeadcountGroups([
      session({
        id: 'a',
        receivedAt: '2026-12-31T05:00:00.000Z',
        accounted: 2,
        closedWithMissing: false,
      }),
      session({ id: 'b', receivedAt: '2026-12-31T05:58:00.000Z', accounted: 1 }),
      session({
        id: 'c',
        groupName: null,
        expected: 3,
        accounted: 3,
        receivedAt: '2026-12-31T04:00:00.000Z',
      }),
    ]);
    expect(groups).toEqual([
      { label: 'Bus A', checkedIn: 1, expected: 2 },
      { label: 'Whole trip', checkedIn: 3, expected: 3 },
    ]);
  });

  it('open incidents become red alerts; resolved ones do not', () => {
    const alerts = alertsFromIncidents(
      [incident, { ...incident, id: 'x', status: 'resolved' }],
      'trip_1',
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.severity).toBe('red');
    expect(alerts[0]?.detail).toBe('Juho Kim · Kim');
    expect(alerts[0]?.actions).toEqual(['Open Safety']);
  });

  it('buildDashboard: live, travelers from roster, ack-requiring announcements only, no movements', () => {
    const d = buildDashboard({
      me: { accountId: 'acc', email: 'nate@example.com', locale: 'en', memberships: [] },
      org: ORG,
      trips: [
        TRIP,
        { ...TRIP, id: 'trip_2', name: 'Later', startsOn: '2027-03-01', endsOn: '2027-03-05' },
      ],
      activeTripId: 'trip_1',
      roster: [
        {
          id: 'p1',
          tripId: 'trip_1',
          role: 'traveler',
          displayName: 'Minji Park',
          groupName: 'Bus A',
          guardianOf: null,
          accountId: null,
          createdAt: NOW,
        },
        {
          id: 'p2',
          tripId: 'trip_1',
          role: 'traveler',
          displayName: 'Juho Kim',
          groupName: 'Bus A',
          guardianOf: null,
          accountId: null,
          createdAt: NOW,
        },
        {
          id: 'p3',
          tripId: 'trip_1',
          role: 'leader',
          displayName: 'Kim',
          groupName: 'Bus A',
          guardianOf: null,
          accountId: null,
          createdAt: NOW,
        },
      ],
      announcements: [
        {
          id: 'a1',
          tripId: 'trip_1',
          title: 'Breakfast',
          body: 'Lobby',
          requiresAck: true,
          sharedWithGuardians: false,
          authorName: 'Organizer',
          publishedAt: NOW,
          ackTotal: 3,
          ackCount: 1,
          myAck: 'unacknowledged',
          translation: null,
        },
        {
          id: 'a2',
          tripId: 'trip_1',
          title: 'FYI',
          body: 'x',
          requiresAck: false,
          sharedWithGuardians: false,
          authorName: 'Organizer',
          publishedAt: NOW,
          ackTotal: 3,
          ackCount: 0,
          myAck: 'unacknowledged',
          translation: null,
        },
      ],
      headcounts: [session({})],
      incidents: [incident],
      now: NOW,
    });
    expect(d.live).toBe(true);
    expect(d.organizerName).toBe('Nate');
    expect(d.organizationName).toBe('Seoul Arts High');
    expect(d.trips.map((t) => [t.status, t.travelerCount, t.destination])).toEqual([
      ['active', 2, 'Rome'],
      ['planning', 0, 'Rome'],
    ]);
    expect(d.activeTripId).toBe('trip_1');
    expect(d.movements).toEqual([]);
    expect(d.announcements).toEqual([
      { id: 'a1', title: 'Breakfast', acknowledged: 1, total: 3, publishedAt: NOW },
    ]);
    expect(d.alerts.map((a) => a.title)).toEqual([incident.title]);
    expect(d.headcount).toEqual([{ label: 'Bus A', checkedIn: 1, expected: 2 }]);
  });
});
