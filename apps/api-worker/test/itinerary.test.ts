// Copyright 2026- At Day. All rights reserved.
// Facts: a new trip has day rows for every date and no events, revision 0; the organizer upserts
// draft events (unpublished), a leader and a traveler read the published view (empty before the
// first publish) and cannot write; publish with the current revision snapshots the draft as
// revision 1 and marks rows published; a stale expected revision is 409; a later edit and a
// removal count as unpublished until revision 2, after which the traveler sees the new state.

import type {
  IssueInvitesResponse,
  Itinerary,
  ItineraryEvent,
  RosterImportResponse,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

const EVENT = {
  date: '2026-12-31',
  start: '09:00',
  end: '11:00',
  timeZone: 'Europe/Rome',
  kind: 'activity',
  title: 'Colosseum guided tour',
  place: 'Colosseum, main entrance',
  pax: null,
  status: 'scheduled',
  note: null,
  order: 1,
};

describe('itinerary', () => {
  it('draft, roles, publish with optimistic concurrency, second revision', async () => {
    const nate = await signIn('nate-it@example.com');
    const org = await createOrg(nate);
    const trip = await createTrip(nate, org.id);
    const base = `/v1/orgs/${org.id}/trips/${trip.id}/itinerary`;
    const imported = await json<RosterImportResponse>(
      await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/import`, {
        csv: SAMPLE_CSV,
      }),
    );
    expect(imported.created).toBe(5); // 3 travelers + 2 guardians
    await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/leaders`, {
      displayName: 'Kim',
      groupName: 'Bus A',
    });
    const issued = await json<IssueInvitesResponse>(
      await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/invites`),
    );
    const codeFor = (n: string) => issued.invites.find((i) => i.displayName === n)?.code ?? '';
    const kim = await signIn('kim-it@example.com');
    await api(kim).post('/v1/invites/redeem', { code: codeFor('Kim') });
    const minji = await signIn('minji-it@example.com');
    await api(minji).post('/v1/invites/redeem', { code: codeFor('Minji Park') });

    const empty = await json<Itinerary>(await api(nate).get(base));
    expect(empty.view).toBe('draft');
    expect(empty.revision).toBe(0);
    expect(empty.events).toEqual([]);
    expect(empty.days.length).toBeGreaterThan(1);
    expect(empty.days[0]?.date).toBe(trip.startsOn);
    expect(empty.days[empty.days.length - 1]?.date).toBe(trip.endsOn);
    expect(empty.days[0]?.timeZone).toBe(trip.timezone);
    expect(empty.unpublished).toBe(0);

    const id = crypto.randomUUID();
    const draft = await json<ItineraryEvent>(await api(nate).put(`${base}/events/${id}`, EVENT));
    expect(draft).toMatchObject({ id, tripId: trip.id, title: EVENT.title, published: false });
    const second = crypto.randomUUID();
    await api(nate).put(`${base}/events/${second}`, {
      ...EVENT,
      title: 'Lunch',
      kind: 'meal',
      order: 2,
      start: '12:00',
      end: null,
    });
    const withDraft = await json<Itinerary>(await api(nate).get(base));
    expect(withDraft.events.map((e) => e.title)).toEqual(['Colosseum guided tour', 'Lunch']);
    expect(withDraft.unpublished).toBe(2);

    // Readers: published view, nothing yet; writes refused.
    const forKim = await json<Itinerary>(await api(kim).get(base));
    expect(forKim.view).toBe('published');
    expect(forKim.events).toEqual([]);
    expect(forKim.revision).toBe(0);
    expect((await api(kim).put(`${base}/events/${crypto.randomUUID()}`, EVENT)).status).toBe(403);
    expect((await api(minji).post(`${base}/publish`, { expectedRevision: 0 })).status).toBe(403);

    // Stale expected revision, then the real publish.
    expect((await api(nate).post(`${base}/publish`, { expectedRevision: 3 })).status).toBe(409);
    const rev1 = await json<Itinerary>(
      await api(nate).post(`${base}/publish`, { expectedRevision: 0 }),
    );
    expect(rev1.revision).toBe(1);
    expect(rev1.publishedAt).not.toBeNull();
    expect(rev1.unpublished).toBe(0);
    expect(rev1.events.every((e) => e.published)).toBe(true);
    expect((await api(nate).post(`${base}/publish`, { expectedRevision: 1 })).status).toBe(409); // nothing to publish

    const forMinji = await json<Itinerary>(await api(minji).get(base));
    expect(forMinji.revision).toBe(1);
    expect(forMinji.events.map((e) => e.title)).toEqual(['Colosseum guided tour', 'Lunch']);

    // Edit one, remove one: two unpublished changes; readers still see revision 1.
    await api(nate).put(`${base}/events/${id}`, {
      ...EVENT,
      title: 'Colosseum tour (early)',
      start: '08:30',
    });
    expect((await api(nate).delete(`${base}/events/${second}`)).status).toBe(204);
    expect((await api(nate).delete(`${base}/events/${second}`)).status).toBe(404);
    const dirty = await json<Itinerary>(await api(nate).get(base));
    expect(dirty.unpublished).toBe(2);
    expect(dirty.events).toHaveLength(1);
    const stillRev1 = await json<Itinerary>(await api(kim).get(base));
    expect(stillRev1.events.map((e) => e.title)).toEqual(['Colosseum guided tour', 'Lunch']);

    const rev2 = await json<Itinerary>(
      await api(nate).post(`${base}/publish`, { expectedRevision: 1 }),
    );
    expect(rev2.revision).toBe(2);
    const afterKim = await json<Itinerary>(await api(kim).get(base));
    expect(afterKim.revision).toBe(2);
    expect(afterKim.events.map((e) => [e.title, e.start])).toEqual([
      ['Colosseum tour (early)', '08:30'],
    ]);

    // Same id on another trip: 409.
    const other = await createTrip(nate, org.id);
    expect(
      (await api(nate).put(`/v1/orgs/${org.id}/trips/${other.id}/itinerary/events/${id}`, EVENT))
        .status,
    ).toBe(409);
  });
});
