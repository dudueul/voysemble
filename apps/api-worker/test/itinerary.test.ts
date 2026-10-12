// Copyright 2026- At Day. All rights reserved.
// Facts: a new trip has day rows for every date and no events, revision 0; the organizer upserts
// draft events (unpublished), a leader and a traveler read the published view (empty before the
// first publish) and cannot write; publish with the current revision snapshots the draft as
// revision 1 and marks rows published; a stale expected revision is 409; a later edit and a
// removal count as unpublished until revision 2, after which the traveler sees the new state.

import type {
  Announcement,
  IssueInvitesResponse,
  Itinerary,
  ItineraryEvent,
  ItineraryProposal,
  ProposalList,
  PublishItineraryResponse,
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
    const first = await json<PublishItineraryResponse>(
      await api(nate).post(`${base}/publish`, { expectedRevision: 0 }),
    );
    const rev1 = first.itinerary;
    expect(rev1.revision).toBe(1);
    expect(rev1.publishedAt).not.toBeNull();
    expect(rev1.unpublished).toBe(0);
    expect(rev1.events.every((e) => e.published)).toBe(true);
    expect(first.announcementId).toBeNull(); // the first publish is the plan, not a change
    expect(first.diff).toMatchObject({
      revision: 1,
      fromRevision: 0,
      added: 2,
      changed: 0,
      removed: 0,
    });
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

    const secondPublish = await json<PublishItineraryResponse>(
      await api(nate).post(`${base}/publish`, { expectedRevision: 1, notify: false }),
    );
    const rev2 = secondPublish.itinerary;
    expect(rev2.revision).toBe(2);
    expect(secondPublish.announcementId).toBeNull(); // published quietly
    expect(secondPublish.diff).toMatchObject({
      revision: 2,
      fromRevision: 1,
      changed: 1,
      removed: 1,
    });
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

  it('leader proposals: file, list, accept applies to the draft, reject records, roles', async () => {
    const nate = await signIn('nate-prop@example.com');
    const org = await createOrg(nate);
    const trip = await createTrip(nate, org.id);
    const base = `/v1/orgs/${org.id}/trips/${trip.id}/itinerary`;
    await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/import`, { csv: SAMPLE_CSV });
    await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/leaders`, {
      displayName: 'Kim',
      groupName: 'Bus A',
    });
    const issued = await json<IssueInvitesResponse>(
      await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/invites`),
    );
    const codeFor = (n: string) => issued.invites.find((i) => i.displayName === n)?.code ?? '';
    const kim = await signIn('kim-prop@example.com');
    await api(kim).post('/v1/invites/redeem', { code: codeFor('Kim') });
    const minji = await signIn('minji-prop@example.com');
    await api(minji).post('/v1/invites/redeem', { code: codeFor('Minji Park') });

    const id = crypto.randomUUID();
    await api(nate).put(`${base}/events/${id}`, EVENT);
    await api(nate).post(`${base}/publish`, { expectedRevision: 0 });

    // Traveler cannot propose; unknown event 404; add without a full event 400.
    expect(
      (
        await api(minji).post(`${base}/proposals`, {
          kind: 'edit',
          eventId: id,
          patch: { start: '08:30' },
          note: 'x',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api(kim).post(`${base}/proposals`, {
          kind: 'edit',
          eventId: crypto.randomUUID(),
          patch: { start: '08:30' },
          note: 'x',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api(kim).post(`${base}/proposals`, {
          kind: 'add',
          eventId: null,
          patch: { title: 'Snack' },
          note: 'x',
        })
      ).status,
    ).toBe(400);

    const edit = await json<ItineraryProposal>(
      await api(kim).post(`${base}/proposals`, {
        kind: 'edit',
        eventId: id,
        patch: { start: '08:30', note: 'Gate opens early.' },
        note: 'Guide asked us to come 30 min earlier.',
      }),
    );
    expect(edit).toMatchObject({
      kind: 'edit',
      status: 'pending',
      proposedByName: 'Kim',
      eventTitle: EVENT.title,
    });
    const add = await json<ItineraryProposal>(
      await api(kim).post(`${base}/proposals`, {
        kind: 'add',
        eventId: null,
        patch: {
          ...EVENT,
          title: 'Gelato stop',
          kind: 'free',
          start: '11:15',
          end: '11:45',
          order: 2,
        },
        note: 'Kids need a break.',
      }),
    );
    const remove = await json<ItineraryProposal>(
      await api(kim).post(`${base}/proposals`, {
        kind: 'remove',
        eventId: id,
        patch: {},
        note: 'Closed today.',
      }),
    );
    expect(add.eventTitle).toBe('Gelato stop');

    // Draft untouched so far; the leader sees the list; the traveler does not.
    const before = await json<Itinerary>(await api(nate).get(base));
    expect(before.unpublished).toBe(0);
    const list = await json<ProposalList>(await api(kim).get(`${base}/proposals`));
    expect(list.proposals.map((p) => p.kind)).toEqual(['remove', 'add', 'edit']);
    expect((await api(minji).get(`${base}/proposals`)).status).toBe(403);
    expect(
      (
        await api(kim).post(`${base}/proposals/${edit.id}/decide`, {
          decision: 'accept',
          note: null,
        })
      ).status,
    ).toBe(403);

    // Accept edit: the draft row carries the patch and is unpublished; accept add: a new row.
    const accepted = await json<ItineraryProposal>(
      await api(nate).post(`${base}/proposals/${edit.id}/decide`, {
        decision: 'accept',
        note: null,
      }),
    );
    expect(accepted.status).toBe('accepted');
    expect(accepted.decidedByName).toBe('Organizer');
    await api(nate).post(`${base}/proposals/${add.id}/decide`, {
      decision: 'accept',
      note: 'Good call.',
    });
    const after = await json<Itinerary>(await api(nate).get(base));
    expect(after.unpublished).toBe(2);
    const edited = after.events.find((e) => e.id === id);
    expect(edited?.start).toBe('08:30');
    expect(edited?.note).toBe('Gate opens early.');
    expect(edited?.title).toBe(EVENT.title);
    expect(edited?.published).toBe(false);
    expect(after.events.map((e) => e.title).sort()).toEqual([
      'Colosseum guided tour',
      'Gelato stop',
    ]);

    // Reject the removal with a reason; deciding twice is 409.
    const rejected = await json<ItineraryProposal>(
      await api(nate).post(`${base}/proposals/${remove.id}/decide`, {
        decision: 'reject',
        note: 'It reopens at noon.',
      }),
    );
    expect(rejected.status).toBe('rejected');
    expect(rejected.decisionNote).toBe('It reopens at noon.');
    expect(
      (
        await api(nate).post(`${base}/proposals/${remove.id}/decide`, {
          decision: 'accept',
          note: null,
        })
      ).status,
    ).toBe(409);
    expect(after.events).toHaveLength(2);

    // A remove proposal whose event vanished answers 409 on accept.
    const stale = await json<ItineraryProposal>(
      await api(kim).post(`${base}/proposals`, {
        kind: 'remove',
        eventId: id,
        patch: {},
        note: 'Again.',
      }),
    );
    await api(nate).delete(`${base}/events/${id}`);
    expect(
      (
        await api(nate).post(`${base}/proposals/${stale.id}/decide`, {
          decision: 'accept',
          note: null,
        })
      ).status,
    ).toBe(409);
    const final = await json<ProposalList>(await api(nate).get(`${base}/proposals`));
    expect(final.proposals.map((p) => p.status)).toEqual([
      'pending',
      'rejected',
      'accepted',
      'accepted',
    ]);
  });

  it('revision announcement: diff with required ack and guardian copy; silent for past days (slice 020)', async () => {
    const nate = await signIn('nate-rev@example.com');
    const org = await createOrg(nate); // defaultLocale ko → Korean primary body, English translation
    const trip = await createTrip(nate, org.id);
    const base = `/v1/orgs/${org.id}/trips/${trip.id}/itinerary`;
    await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/import`, { csv: SAMPLE_CSV });
    const issued = await json<IssueInvitesResponse>(
      await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/invites`),
    );
    const codeFor = (n: string) => issued.invites.find((i) => i.displayName === n)?.code ?? '';
    const minji = await signIn('minji-rev@example.com');
    await api(minji).post('/v1/invites/redeem', { code: codeFor('Minji Park') });
    const sora = await signIn('sora-rev@example.com');
    await api(sora).post('/v1/invites/redeem', { code: codeFor('Sora Park') });

    // Two events far in the future (the sample trip dates are in the past relative to "today"
    // only if the clock passed them; use the trip's own last day so the rule is stable).
    const lastDay = trip.endsOn;
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    await api(nate).put(`${base}/events/${a}`, {
      ...EVENT,
      date: lastDay,
      title: 'Colosseum guided tour',
    });
    await api(nate).put(`${base}/events/${b}`, {
      ...EVENT,
      date: lastDay,
      title: 'Lunch',
      start: '12:00',
      end: null,
      order: 2,
    });
    await api(nate).post(`${base}/publish`, { expectedRevision: 0 });

    // Revision 2: move one, remove one, add one, with an organizer note → one announcement.
    await api(nate).put(`${base}/events/${a}`, {
      ...EVENT,
      date: lastDay,
      title: 'Colosseum guided tour',
      start: '08:30',
    });
    await api(nate).delete(`${base}/events/${b}`);
    const c = crypto.randomUUID();
    await api(nate).put(`${base}/events/${c}`, {
      ...EVENT,
      date: lastDay,
      title: 'Gelato stop',
      kind: 'free',
      start: '11:15',
      end: '11:45',
      order: 3,
    });
    const pub = await json<PublishItineraryResponse>(
      await api(nate).post(`${base}/publish`, {
        expectedRevision: 1,
        note: 'Guide asked for an earlier start.',
      }),
    );
    expect(pub.diff).toMatchObject({
      revision: 2,
      fromRevision: 1,
      added: 1,
      changed: 1,
      removed: 1,
    });
    expect(pub.diff.changes.map((ch) => [ch.kind, ch.title, ch.previousStart])).toEqual([
      ['changed', 'Colosseum guided tour', '09:00'],
      ['added', 'Gelato stop', null],
      ['removed', 'Lunch', null],
    ]);
    expect(pub.announcementId).not.toBeNull();

    const forMinji = await json<{ announcements: Announcement[] }>(
      await api(minji).get(`/v1/orgs/${org.id}/trips/${trip.id}/announcements`),
    );
    const ann = forMinji.announcements.find((x) => x.id === pub.announcementId) as Announcement;
    expect(ann.kind).toBe('itinerary_revision');
    expect(ann.requiresAck).toBe(true);
    expect(ann.sharedWithGuardians).toBe(true);
    expect(ann.authorName).toBe('Organizer');
    expect(ann.title).toBe('일정 변경 안내');
    expect(ann.body).toContain('일정이 변경되었습니다: 변경 3건.');
    expect(ann.body).toContain('Colosseum guided tour 09:00에서 08:30로 변경되었습니다.');
    expect(ann.body).toContain('Gelato stop 11:15에 추가되었습니다.');
    expect(ann.body).toContain('Lunch 일정이 취소되었습니다.');
    expect(ann.body).toContain('주최자 메모: Guide asked for an earlier start.');
    expect(ann.translation).toMatchObject({ locale: 'en', provider: 'system' });
    expect(ann.translation?.body).toContain('The itinerary was updated: 3 changes.');
    expect(ann.translation?.body).toContain('Colosseum guided tour now 08:30 (was 09:00).');
    expect(ann.revision).toMatchObject({
      revision: 2,
      fromRevision: 1,
      added: 1,
      changed: 1,
      removed: 1,
    });
    expect(ann.revision?.changes).toHaveLength(3);
    expect(ann.ackTotal).toBe(3); // travelers only on this roster (no leader added)

    // The guardian gets the same card (shared), and acks work as for any announcement.
    const forSora = await json<{ announcements: Announcement[] }>(
      await api(sora).get(`/v1/orgs/${org.id}/trips/${trip.id}/announcements`),
    );
    expect(forSora.announcements.map((x) => x.id)).toContain(pub.announcementId);
    const ack = await api(minji).post(
      `/v1/orgs/${org.id}/trips/${trip.id}/announcements/${pub.announcementId}/ack`,
      { ackedAtDevice: new Date().toISOString() },
    );
    expect(ack.status).toBe(200);

    // A past-day-only change publishes silently; so does a quiet publish of a current change.
    const past = crypto.randomUUID();
    await api(nate).put(`${base}/events/${past}`, {
      ...EVENT,
      date: '2000-01-01',
      title: 'Long ago',
    });
    const silent = await json<PublishItineraryResponse>(
      await api(nate).post(`${base}/publish`, { expectedRevision: 2 }),
    );
    expect(silent.diff.added).toBe(1);
    expect(silent.announcementId).toBeNull();
    await api(nate).put(`${base}/events/${c}`, {
      ...EVENT,
      date: lastDay,
      title: 'Gelato stop',
      kind: 'free',
      start: '11:30',
      end: '11:45',
      order: 3,
    });
    const quiet = await json<PublishItineraryResponse>(
      await api(nate).post(`${base}/publish`, { expectedRevision: 3, notify: false }),
    );
    expect(quiet.announcementId).toBeNull();
    const all = await json<{ announcements: Announcement[] }>(
      await api(nate).get(`/v1/orgs/${org.id}/trips/${trip.id}/announcements`),
    );
    expect(all.announcements.filter((x) => x.kind === 'itinerary_revision')).toHaveLength(1);
  });
});
