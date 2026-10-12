// Copyright 2026- At Day. All rights reserved.
// Facts (D19, slice 057): the history lists the published revisions newest first with who, when,
// what changed and how many events; a revision's snapshot is the events exactly as published;
// a traveler reads the history too (published content); an unknown revision and an unknown trip
// are 404; a trip never published has an empty history.

import type { ItineraryRevisionDetail, ItineraryRevisionList } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

describe('itinerary revision history (slice 057)', () => {
  it('lists the revisions with their diffs and serves a snapshot', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    const trip = await createTrip(nate, org.id);
    const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
    expect(
      (await json<ItineraryRevisionList>(await api(nate).get(`${base}/itinerary/revisions`)))
        .revisions,
    ).toEqual([]);

    const eventId = crypto.randomUUID();
    const event = (start: string) => ({
      date: trip.startsOn,
      start,
      end: null,
      timeZone: trip.timezone,
      kind: 'meeting',
      title: 'Group check-in',
      place: 'ICN Terminal 2',
      pax: null,
      status: 'scheduled',
      note: null,
      order: 1,
    });
    expect(
      (await api(nate).put(`${base}/itinerary/events/${eventId}`, event('09:00'))).status,
    ).toBe(200);
    expect(
      (
        await api(nate).post(`${base}/itinerary/publish`, {
          expectedRevision: 0,
          notify: false,
          note: null,
        })
      ).status,
    ).toBe(200);
    expect(
      (await api(nate).put(`${base}/itinerary/events/${eventId}`, event('08:30'))).status,
    ).toBe(200);
    expect(
      (
        await api(nate).post(`${base}/itinerary/publish`, {
          expectedRevision: 1,
          notify: false,
          note: null,
        })
      ).status,
    ).toBe(200);

    const list = await json<ItineraryRevisionList>(
      await api(nate).get(`${base}/itinerary/revisions`),
    );
    expect(
      list.revisions.map((r) => [
        r.revision,
        r.publishedByName,
        r.events,
        r.summary.added,
        r.summary.changed,
        r.summary.removed,
      ]),
    ).toEqual([
      [2, 'Organizer', 1, 0, 1, 0],
      [1, 'Organizer', 1, 1, 0, 0],
    ]);
    expect(list.revisions[0]?.summary.changes[0]).toMatchObject({
      kind: 'changed',
      title: 'Group check-in',
      start: '08:30',
      previousStart: '09:00',
      day: 1,
    });
    expect((list.revisions[0]?.publishedAt ?? '') > (list.revisions[1]?.publishedAt ?? '')).toBe(
      true,
    );

    const first = await json<ItineraryRevisionDetail>(
      await api(nate).get(`${base}/itinerary/revisions/1`),
    );
    expect(first.snapshot.map((e) => [e.id, e.start, e.published])).toEqual([
      [eventId, '09:00', true],
    ]);
    const second = await json<ItineraryRevisionDetail>(
      await api(nate).get(`${base}/itinerary/revisions/2`),
    );
    expect(second.snapshot[0]?.start).toBe('08:30');
    expect((await api(nate).get(`${base}/itinerary/revisions/3`)).status).toBe(404);
    expect(
      (await api(nate).get(`/v1/orgs/${org.id}/trips/${crypto.randomUUID()}/itinerary/revisions`))
        .status,
    ).toBe(404);

    // A traveler reads the history: it is the published plan, kept.
    await api(nate).post(`${base}/roster/import`, { csv: SAMPLE_CSV });
    const issued = await json<{ invites: { displayName: string; code: string }[] }>(
      await api(nate).post(`${base}/invites`),
    );
    const minji = await signIn('minji@example.com');
    const code = issued.invites.find((i) => i.displayName === 'Minji Park')?.code;
    expect((await api(minji).post('/v1/invites/redeem', { code })).status).toBe(200);
    expect(
      (await json<ItineraryRevisionList>(await api(minji).get(`${base}/itinerary/revisions`)))
        .revisions,
    ).toHaveLength(2);
  });
});
