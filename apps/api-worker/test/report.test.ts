// Copyright 2026- At Day. All rights reserved.
// Facts (slice 034): device times subtract with a midnight wrap; dates land in the trip zone and
// days count from the trip start; the builder averages ack rates and close minutes per day and
// overall, counts incidents and fee totals, and names the latest missing per group; through the
// API the report reflects a closed head count with a missing traveler and a published
// announcement, and a leader is 403.

import {
  type Announcement,
  dateInZone,
  type HeadcountSession,
  type Incident,
  latestMissingOf,
  minutesBetweenDeviceTimes,
  type Trip,
  type TripReport,
  tripDayIndex,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { buildTripReport } from '../src/lib/report';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

const trip: Trip = {
  id: 'trip1',
  organizationId: 'org1',
  name: 'Korea Concert Tour',
  startsOn: '2026-12-28',
  endsOn: '2027-01-07',
  timezone: 'Europe/Rome',
  status: 'planning',
  createdAt: '2026-10-01T00:00:00.000Z',
} as Trip;

const ann = (over: Partial<Announcement>): Announcement =>
  ({
    id: crypto.randomUUID(),
    tripId: 'trip1',
    title: 't',
    body: 'b',
    requiresAck: true,
    sharedWithGuardians: false,
    authorName: 'Organizer',
    publishedAt: '2026-12-28T06:00:00.000Z',
    ackTotal: 10,
    ackCount: 7,
    myAck: 'unacknowledged',
    translation: null,
    kind: 'announcement',
    ...over,
  }) as Announcement;

const hc = (over: Partial<HeadcountSession>): HeadcountSession =>
  ({
    id: crypto.randomUUID(),
    tripId: 'trip1',
    groupName: 'Bus A',
    openedByName: 'Kim',
    openedAtDevice: '06:50',
    closedAtDevice: '06:58',
    receivedAt: '2026-12-28T06:00:00.000Z',
    expected: 2,
    present: 2,
    accounted: 2,
    missing: [],
    closedWithMissing: false,
    ...over,
  }) as HeadcountSession;

describe('trip report helpers', () => {
  it('device minutes, zone dates, day indexes', () => {
    expect(minutesBetweenDeviceTimes('06:50', '06:58')).toBe(8);
    expect(minutesBetweenDeviceTimes('23:55', '00:05')).toBe(10);
    expect(minutesBetweenDeviceTimes('x', '00:05')).toBeNull();
    expect(dateInZone('2026-12-28T23:30:00.000Z', 'Asia/Seoul')).toBe('2026-12-29');
    expect(dateInZone('2026-12-28T23:30:00.000Z', 'Europe/Rome')).toBe('2026-12-29');
    expect(dateInZone('2026-12-28T22:30:00.000Z', 'Europe/Rome')).toBe('2026-12-28');
    expect(dateInZone('2026-12-28T22:30:00.000Z', 'Nowhere/Zone')).toBe('2026-12-28');
    expect(tripDayIndex('2026-12-28', '2026-12-28')).toBe(1);
    expect(tripDayIndex('2027-01-01', '2026-12-28')).toBe(5);
    expect(tripDayIndex('2026-12-27', '2026-12-28')).toBe(0);
  });

  it('builds per-day and overall numbers', () => {
    const report = buildTripReport({
      trip,
      announcements: [
        ann({ ackTotal: 10, ackCount: 7 }),
        ann({ ackTotal: 10, ackCount: 9, publishedAt: '2026-12-29T06:00:00.000Z' }),
        ann({
          requiresAck: false,
          ackTotal: 0,
          ackCount: 0,
          publishedAt: '2026-12-29T07:00:00.000Z',
        }),
        ann({ kind: 'itinerary_revision', publishedAt: '2026-12-29T08:00:00.000Z' }),
      ],
      headcounts: [
        hc({}),
        hc({
          groupName: 'Bus B',
          openedAtDevice: '06:40',
          closedAtDevice: '06:52',
          receivedAt: '2026-12-29T06:00:00.000Z',
          missing: [
            {
              participationId: 'p9',
              displayName: 'Dohyun Kang',
              groupName: 'Bus B',
              mark: 'missing',
            },
          ],
          closedWithMissing: true,
          present: 1,
          accounted: 1,
        }),
        hc({ closedAtDevice: null, receivedAt: '2026-12-29T07:00:00.000Z' }),
      ],
      incidents: [
        {
          id: 'i1',
          status: 'open',
          openedAt: '2026-12-29T06:00:00.000Z',
          resolvedAt: null,
        } as Incident,
        {
          id: 'i2',
          status: 'resolved',
          openedAt: '2026-12-28T06:00:00.000Z',
          resolvedAt: '2026-12-28T06:30:00.000Z',
        } as Incident,
      ],
      fees: {
        currency: 'KRW',
        rows: [{} as never],
        withoutFee: 0,
        totals: {
          expectedMinor: 1000,
          collectedMinor: 250,
          refundedMinor: 0,
          paid: 0,
          partial: 1,
          unpaid: 3,
          refunded: 0,
        },
      },
      now: '2026-12-29T09:00:00.000Z',
    });
    expect(report.announcements).toEqual({ total: 3, requiringAck: 2, avgAckRate: 80 });
    expect(report.headcounts).toEqual({
      total: 3,
      closed: 2,
      closedWithMissing: 1,
      avgCloseMinutes: 10,
      lastCloseMinutes: 12,
    });
    expect(report.incidents).toEqual({ open: 1, resolved: 1, avgResolveMinutes: 30 });
    expect(report.fees?.collectedPct).toBe(25);
    expect(
      report.byDay.map((d) => [
        d.day,
        d.announcementsSent,
        d.ackRate,
        d.headcounts,
        d.avgCloseMinutes,
        d.missing,
      ]),
    ).toEqual([
      [1, 1, 70, 1, 8, 0],
      [2, 2, 90, 2, 12, 1],
    ]);
    expect(
      report.missingNow.map((m) => [m.groupName, m.missing.map((x) => x.displayName)]),
    ).toEqual([['Bus B', ['Dohyun Kang']]]);
    // Empty inputs are honest nulls, not zeros pretending to be facts.
    const empty = buildTripReport({
      trip,
      announcements: [],
      headcounts: [],
      incidents: [],
      fees: null,
      now: 'x',
    });
    expect(empty.announcements.avgAckRate).toBeNull();
    expect(empty.headcounts.lastCloseMinutes).toBeNull();
    expect(empty.fees).toBeNull();
    expect(empty.byDay).toEqual([]);
  });

  it('latestMissingOf keeps only the newest closed count per group with missing travelers', () => {
    const older = hc({
      receivedAt: '2026-12-28T06:00:00.000Z',
      closedWithMissing: true,
      missing: [{ participationId: 'p1', displayName: 'A', groupName: 'Bus A', mark: 'missing' }],
    });
    const newerClean = hc({ receivedAt: '2026-12-29T06:00:00.000Z' });
    expect(latestMissingOf([older, newerClean])).toEqual([]);
    expect(
      latestMissingOf([
        newerClean,
        older,
        hc({
          groupName: 'Bus B',
          closedWithMissing: true,
          missing: [
            { participationId: 'p2', displayName: 'B', groupName: 'Bus B', mark: 'missing' },
          ],
        }),
      ]).map((m) => m.groupName),
    ).toEqual(['Bus B']);
  });
});

describe('GET .../report (slice 034)', () => {
  it('reflects a closed head count with a missing traveler and a published announcement; leaders are 403', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    const trip = await createTrip(nate, org.id);
    const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
    await api(nate).post(`${base}/roster/import`, { csv: SAMPLE_CSV });
    await api(nate).post(`${base}/roster/leaders`, { displayName: 'Kim', groupName: 'Bus A' });
    const issued = await json<{
      invites: { displayName: string; code: string; participationId: string }[];
    }>(await api(nate).post(`${base}/invites`));
    const kim = await signIn('kim@example.com');
    expect(
      (
        await api(kim).post('/v1/invites/redeem', {
          code: issued.invites.find((i) => i.displayName === 'Kim')?.code,
        })
      ).status,
    ).toBe(200);
    const minji = issued.invites.find((i) => i.displayName === 'Minji Park')?.participationId;
    const sync = await api(kim).put(`${base}/headcounts/${crypto.randomUUID()}`, {
      openedAtDevice: '06:50',
      closedAtDevice: '06:58',
      groupName: 'Bus A',
      marks: [{ participationId: minji, mark: 'present' }],
    });
    expect(sync.status).toBe(200);
    expect(
      (
        await api(nate).post(`${base}/announcements`, {
          title: 'Bus',
          body: 'Lobby 07:15',
          requiresAck: true,
        })
      ).status,
    ).toBe(201);
    expect((await api(kim).get(`${base}/report`)).status).toBe(403);
    const report = await json<TripReport>(await api(nate).get(`${base}/report`));
    expect(report.headcounts).toMatchObject({
      total: 1,
      closed: 1,
      closedWithMissing: 1,
      lastCloseMinutes: 8,
    });
    expect(report.missingNow).toHaveLength(1);
    expect(report.missingNow[0]).toMatchObject({
      groupName: 'Bus A',
      closedAtDevice: '06:58',
      openedByName: 'Kim',
    });
    expect(report.missingNow[0]?.missing.map((m) => m.displayName)).toEqual(['Juho Kim']);
    expect(report.announcements).toMatchObject({ total: 1, requiringAck: 1 });
    expect(report.incidents.open).toBe(1);
    expect(report.fees).toBeNull();
    expect(report.byDay).toHaveLength(1);
    expect(report.byDay[0]).toMatchObject({
      announcementsSent: 1,
      headcounts: 1,
      missing: 1,
      avgCloseMinutes: 8,
    });
  });
});
