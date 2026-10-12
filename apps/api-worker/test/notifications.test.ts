// Copyright 2026- At Day. All rights reserved.
// Facts (D29, slice 052): a required-ack announcement shared with guardians reaches travelers in
// the priority lane, leaders in the normal lane and guardians in the normal lane; a plain one
// skips guardians; a head count opened for Bus A calls that group's travelers and leaders at
// once and nobody in Bus B; a close with someone missing tells the guardians of the missing and
// the group's leaders; an accepted proposal tells the leader who proposed; the inbox lists what
// was delivered with its unread count and a read is a read; the organizer's log counts the lanes;
// quiet hours hold the normal lane (and only it) until they end; an organizer has no inbox;
// travelers and guardians cannot read the log.

import type {
  Announcement,
  ItineraryProposal,
  MyNotifications,
  Notification,
  NotificationLog,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { localClock } from '../src/lib/time';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

async function setupTrip() {
  const nate = await signIn('nate@example.com');
  const org = await createOrg(nate);
  const trip = await createTrip(nate, org.id);
  const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
  await api(nate).post(`${base}/roster/import`, { csv: SAMPLE_CSV });
  await api(nate).post(`${base}/roster/leaders`, { displayName: 'Kim', groupName: 'Bus A' });
  const issued = await json<{ invites: { displayName: string; code: string }[] }>(
    await api(nate).post(`${base}/invites`),
  );
  const redeem = async (email: string, name: string) => {
    const c = await signIn(email);
    const code = issued.invites.find((i) => i.displayName === name)?.code;
    expect((await api(c).post('/v1/invites/redeem', { code })).status).toBe(200);
    return c;
  };
  return {
    nate,
    org,
    trip,
    base,
    kim: await redeem('kim@example.com', 'Kim'),
    minji: await redeem('minji@example.com', 'Minji Park'),
    juho: await redeem('juho@example.com', 'Juho Kim'),
    hana: await redeem('hana@example.com', 'Lee, Hana'),
    sora: await redeem('sora@example.com', 'Sora Park'),
  };
}

const laneOf = (inbox: MyNotifications, kind: string) =>
  inbox.notifications.filter((n) => n.kind === kind).map((n) => n.lane);

describe('notification lanes (slice 052)', () => {
  it('fan out by role and group, fill the inbox and the log, hold the normal lane in quiet hours', async () => {
    const t = await setupTrip();
    const mine = async (c: Parameters<typeof api>[0]) =>
      json<MyNotifications>(await api(c).get(`${t.base}/notifications/mine`));
    // No quiet hours for now (a zero-length window), so the normal lane delivers at once whatever
    // the wall-clock in the trip's zone; the end of the test turns them on around now.
    expect(
      (
        await api(t.nate).patch(`/v1/orgs/${t.org.id}`, {
          settings: { quietHours: { from: '09:00', to: '09:00' } },
        })
      ).status,
    ).toBe(200);

    // A required-ack announcement shared with guardians.
    const shared = await json<Announcement>(
      await api(t.nate).post(`${t.base}/announcements`, {
        title: 'Breakfast moved to 06:30',
        body: 'Lobby. Bus leaves 07:15.',
        requiresAck: true,
        sharedWithGuardians: true,
      }),
    );
    expect(laneOf(await mine(t.minji), 'announcement')).toEqual(['priority']);
    expect(laneOf(await mine(t.kim), 'announcement')).toEqual(['normal']);
    expect(laneOf(await mine(t.sora), 'announcement')).toEqual(['normal']);
    const minjiInbox = await mine(t.minji);
    expect(minjiInbox.unread).toBe(1);
    expect(minjiInbox.notifications[0]).toMatchObject({
      title: 'Breakfast moved to 06:30',
      body: 'Lobby. Bus leaves 07:15.',
      refType: 'announcement',
      refId: shared.id,
      readAt: null,
    });

    // A plain announcement: travelers normal, guardians nothing.
    await api(t.nate).post(`${t.base}/announcements`, {
      title: 'Photos from the rehearsal',
      body: 'In the Memories tab.',
      requiresAck: false,
      sharedWithGuardians: false,
    });
    expect(laneOf(await mine(t.minji), 'announcement')).toEqual(['normal', 'priority']);
    expect(laneOf(await mine(t.sora), 'announcement')).toEqual(['normal']);

    // Kim opens a head count for Bus A: Minji and Juho are called, Hana (Bus B) is not; Kim too.
    const headcountId = crypto.randomUUID();
    const opened = await api(t.kim).put(`${t.base}/headcounts/${headcountId}`, {
      groupName: 'Bus A',
      openedAtDevice: '06:50',
      closedAtDevice: null,
      marks: [],
    });
    expect(opened.status).toBe(200);
    expect(laneOf(await mine(t.minji), 'headcount_call')).toEqual(['priority']);
    expect(laneOf(await mine(t.juho), 'headcount_call')).toEqual(['priority']);
    expect(laneOf(await mine(t.kim), 'headcount_call')).toEqual(['priority']);
    expect(laneOf(await mine(t.hana), 'headcount_call')).toEqual([]);
    expect(laneOf(await mine(t.sora), 'headcount_call')).toEqual([]);
    // A second sync of the same open session calls nobody again.
    await api(t.kim).put(`${t.base}/headcounts/${headcountId}`, {
      groupName: 'Bus A',
      openedAtDevice: '06:50',
      closedAtDevice: null,
      marks: [],
    });
    expect(laneOf(await mine(t.minji), 'headcount_call')).toEqual(['priority']);

    // Closing with Minji missing opens an incident: her guardian and the group's leader hear it.
    const roster = await json<{ participations: { id: string; displayName: string }[] }>(
      await api(t.nate).get(`${t.base}/roster`),
    );
    const minjiId = roster.participations.find((p) => p.displayName === 'Minji Park')?.id ?? '';
    const juhoId = roster.participations.find((p) => p.displayName === 'Juho Kim')?.id ?? '';
    await api(t.kim).put(`${t.base}/headcounts/${headcountId}`, {
      groupName: 'Bus A',
      openedAtDevice: '06:50',
      closedAtDevice: '06:58',
      marks: [
        { participationId: juhoId, mark: 'present' },
        { participationId: minjiId, mark: 'missing' },
      ],
    });
    const soraInbox = await mine(t.sora);
    expect(laneOf(soraInbox, 'incident_status')).toEqual(['priority']);
    expect(soraInbox.notifications[0]?.title).toBe('Missing after the head count: Minji Park');
    expect(laneOf(await mine(t.kim), 'incident_status')).toEqual(['priority']);
    expect(laneOf(await mine(t.minji), 'incident_status')).toEqual([]);
    expect(laneOf(await mine(t.hana), 'incident_status')).toEqual([]);

    // Kim confirms she is with the group: the same two hear the status.
    const incidents = await json<{ incidents: { id: string }[] }>(
      await api(t.nate).get(`${t.base}/incidents`),
    );
    const incidentId = incidents.incidents[0]?.id ?? '';
    expect(
      (
        await api(t.kim).post(`${t.base}/incidents/${incidentId}/confirm`, {
          status: 'with_group',
          note: null,
        })
      ).status,
    ).toBe(200);
    expect(laneOf(await mine(t.sora), 'incident_status')).toEqual(['priority', 'priority']);
    expect((await mine(t.sora)).notifications[0]?.title).toBe('With the group: Minji Park');

    // A proposal Kim made, accepted by Nate: Kim hears it; nobody else.
    const itinerary = await json<{ events: { id: string }[] }>(
      await api(t.nate).get(`${t.base}/itinerary`),
    );
    const eventId = crypto.randomUUID();
    expect(
      (
        await api(t.nate).put(`${t.base}/itinerary/events/${eventId}`, {
          date: t.trip.startsOn,
          start: '09:00',
          end: '10:00',
          timeZone: t.trip.timezone,
          kind: 'meal',
          title: 'Breakfast',
          place: 'Hotel',
          pax: null,
          status: 'scheduled',
          note: null,
          order: 1,
        })
      ).status,
    ).toBe(200);
    expect(itinerary.events.length).toBeGreaterThanOrEqual(0);
    // The first publish carries no revision announcement (D19: revision 2 onwards); the second,
    // with a moved event on a day still ahead, does: travelers and leaders normal.
    expect(
      (
        await api(t.nate).post(`${t.base}/itinerary/publish`, {
          expectedRevision: 0,
          notify: true,
          note: null,
        })
      ).status,
    ).toBe(200);
    expect(laneOf(await mine(t.minji), 'itinerary_revision')).toEqual([]);
    expect(
      (
        await api(t.nate).put(`${t.base}/itinerary/events/${eventId}`, {
          date: t.trip.startsOn,
          start: '09:30',
          end: '10:30',
          timeZone: t.trip.timezone,
          kind: 'meal',
          title: 'Breakfast',
          place: 'Hotel',
          pax: null,
          status: 'scheduled',
          note: null,
          order: 1,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api(t.nate).post(`${t.base}/itinerary/publish`, {
          expectedRevision: 1,
          notify: true,
          note: null,
        })
      ).status,
    ).toBe(200);
    expect(laneOf(await mine(t.minji), 'itinerary_revision')).toEqual(['normal']);
    expect(laneOf(await mine(t.kim), 'itinerary_revision')).toEqual(['normal']);
    const proposal = await json<ItineraryProposal>(
      await api(t.kim).post(`${t.base}/itinerary/proposals`, {
        kind: 'remove',
        eventId,
        patch: {},
        note: 'Rained out',
      }),
    );
    expect(
      (
        await api(t.nate).post(`${t.base}/itinerary/proposals/${proposal.id}/decide`, {
          decision: 'accept',
          note: 'Fine',
        })
      ).status,
    ).toBe(200);
    const kimInbox = await mine(t.kim);
    expect(laneOf(kimInbox, 'proposal_decided')).toEqual(['priority']);
    expect(kimInbox.notifications[0]?.title).toBe('Proposal accepted: Breakfast');
    expect(laneOf(await mine(t.minji), 'proposal_decided')).toEqual([]);

    // A read is a read; the unread count follows.
    const before = await mine(t.minji);
    const first = before.notifications[0] as Notification;
    const read = await json<Notification>(
      await api(t.minji).post(`${t.base}/notifications/${first.id}/read`),
    );
    expect(read.readAt).not.toBeNull();
    expect((await mine(t.minji)).unread).toBe(before.unread - 1);
    expect(
      (await api(t.minji).post(`${t.base}/notifications/${crypto.randomUUID()}/read`)).status,
    ).toBe(404);

    // The organizer's log counts the lanes per event.
    const log = await json<NotificationLog>(await api(t.nate).get(`${t.base}/notifications`));
    const sharedEvent = log.events.find((e) => e.refId === shared.id);
    expect(sharedEvent).toMatchObject({
      kind: 'announcement',
      title: 'Breakfast moved to 06:30',
      lanes: { priority: 3, normal: 3, digest: 0 },
      held: 0,
      recipients: 6,
    });
    const call = log.events.find((e) => e.kind === 'headcount_call');
    expect(call?.lanes).toEqual({ priority: 3, normal: 0, digest: 0 });
    expect((await api(t.kim).get(`${t.base}/notifications`)).status).toBe(200);
    expect((await api(t.minji).get(`${t.base}/notifications`)).status).toBe(403);
    expect((await api(t.sora).get(`${t.base}/notifications`)).status).toBe(403);
    expect((await api(t.nate).get(`${t.base}/notifications/mine`)).status).toBe(403);

    // Quiet hours around now (in the trip's zone) hold the normal lane; the priority lane passes.
    const { time } = localClock(new Date().toISOString(), t.trip.timezone);
    const [h = 0] = time.split(':').map(Number);
    const hh = (n: number) => `${String(((n % 24) + 24) % 24).padStart(2, '0')}:00`;
    expect(
      (
        await api(t.nate).patch(`/v1/orgs/${t.org.id}`, {
          settings: { quietHours: { from: hh(h - 1), to: hh(h + 2) } },
        })
      ).status,
    ).toBe(200);
    const quiet = await json<Announcement>(
      await api(t.nate).post(`${t.base}/announcements`, {
        title: 'Lights out',
        body: 'See you at breakfast.',
        requiresAck: false,
        sharedWithGuardians: true,
      }),
    );
    expect((await mine(t.minji)).notifications.some((n) => n.refId === quiet.id)).toBe(false);
    const loud = await json<Announcement>(
      await api(t.nate).post(`${t.base}/announcements`, {
        title: 'Bus leaves now',
        body: 'Lobby, now.',
        requiresAck: true,
        sharedWithGuardians: false,
      }),
    );
    expect((await mine(t.minji)).notifications.some((n) => n.refId === loud.id)).toBe(true);
    const held = (
      await json<NotificationLog>(await api(t.nate).get(`${t.base}/notifications`))
    ).events.find((e) => e.refId === quiet.id);
    expect(held).toMatchObject({ lanes: { priority: 0, normal: 6, digest: 0 }, held: 6 });
  });
});
