// Copyright 2026- At Day. All rights reserved.
// Facts: a head count closed with missing travelers opens exactly one incident naming them (a
// replay of the closed session returns the same id); a clean close opens none; the list puts
// open cards first; staff resolve with a note (second resolve 409, unknown id 404); travelers
// get 403 on list and resolve. Slice 016: a leader confirms with a note (traveler 403); the
// organizer sends the guardian message composed in both languages from the latest confirmation
// (409 before any confirmation; leaders cannot send); the guardian lists only their traveler's
// card, projected, with the message; a resolved card takes no confirmation. Slice 068: the
// organizer opens a card by hand naming travelers; leaders and guardians hear it; a leader,
// a guardian id, an unknown id and a blank title are refused; the flow continues as usual.

import type {
  Incident,
  IncidentList,
  IssueInvitesResponse,
  MyNotifications,
  RosterImportResponse,
  SyncHeadcountResponse,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

async function setupTrip() {
  const nate = await signIn('nate-inc@example.com');
  const org = await createOrg(nate);
  const trip = await createTrip(nate, org.id);
  const imported = await json<RosterImportResponse>(
    await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/import`, { csv: SAMPLE_CSV }),
  );
  await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/leaders`, {
    displayName: 'Kim',
    groupName: 'Bus A',
  });
  const issued = await json<IssueInvitesResponse>(
    await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/invites`),
  );
  const codeFor = (name: string) => issued.invites.find((i) => i.displayName === name)?.code ?? '';
  const kim = await signIn('kim-inc@example.com');
  await api(kim).post('/v1/invites/redeem', { code: codeFor('Kim') });
  const minji = await signIn('minji-inc@example.com');
  await api(minji).post('/v1/invites/redeem', { code: codeFor('Minji Park') });
  const sora = await signIn('sora-inc@example.com');
  await api(sora).post('/v1/invites/redeem', { code: codeFor('Sora Park') });
  const byName = (name: string) =>
    imported.participations.find((p) => p.displayName === name)?.id ?? '';
  const { SELF } = await import('cloudflare:test');
  const putHeadcount = (token: string, id: string, body: unknown) =>
    SELF.fetch(`https://example.com/v1/orgs/${org.id}/trips/${trip.id}/headcounts/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  return {
    nate,
    kim,
    minji,
    sora,
    org,
    trip,
    byName,
    putHeadcount,
    base: `/v1/orgs/${org.id}/trips/${trip.id}/incidents`,
  };
}

describe('incidents', () => {
  it('a close with missing travelers opens one card; replay returns the same card; clean close none', async () => {
    const { kim, nate, minji, byName, putHeadcount, base } = await setupTrip();
    const hc = crypto.randomUUID();
    const body = {
      openedAtDevice: '06:50',
      closedAtDevice: '06:58',
      groupName: 'Bus A',
      marks: [{ participationId: byName('Minji Park'), mark: 'present' }],
    };
    const first = await json<SyncHeadcountResponse>(await putHeadcount(kim.token, hc, body));
    expect(first.session.closedWithMissing).toBe(true);
    expect(first.incidentId).toMatch(/^[0-9a-f-]{36}$/);
    const replay = await json<SyncHeadcountResponse>(await putHeadcount(kim.token, hc, body));
    expect(replay.applied).toBe(false);
    expect(replay.incidentId).toBe(first.incidentId);

    const clean = await json<SyncHeadcountResponse>(
      await putHeadcount(kim.token, crypto.randomUUID(), {
        openedAtDevice: '07:00',
        closedAtDevice: '07:05',
        groupName: 'Bus A',
        marks: [
          { participationId: byName('Minji Park'), mark: 'present' },
          { participationId: byName('Juho Kim'), mark: 'excused' },
        ],
      }),
    );
    expect(clean.incidentId).toBeNull();

    const list = await json<IncidentList>(await api(nate).get(base));
    expect(list.incidents).toHaveLength(1);
    const card = list.incidents[0] as Incident;
    expect(card.id).toBe(first.incidentId);
    expect(card.kind).toBe('headcount_missing');
    expect(card.status).toBe('open');
    expect(card.headcountId).toBe(hc);
    expect(card.openedByName).toBe('Kim');
    expect(card.title).toBe('Head count closed with 1 missing (Bus A, 06:58)');
    expect(card.people.map((p) => p.displayName)).toEqual(['Juho Kim']);
    expect(card.people[0]?.groupName).toBe('Bus A');

    expect((await api(minji).get(base)).status).toBe(403);
    expect((await api(kim).get(base)).status).toBe(200);
  });

  it('staff resolve with a note once; open cards list first', async () => {
    const { kim, nate, minji, putHeadcount, base } = await setupTrip();
    const older = await json<SyncHeadcountResponse>(
      await putHeadcount(nate.token, crypto.randomUUID(), {
        openedAtDevice: '06:50',
        closedAtDevice: '06:55',
        groupName: null,
        marks: [],
      }),
    );
    const newer = await json<SyncHeadcountResponse>(
      await putHeadcount(kim.token, crypto.randomUUID(), {
        openedAtDevice: '08:00',
        closedAtDevice: '08:05',
        groupName: 'Bus A',
        marks: [],
      }),
    );
    expect(older.session.missing).toHaveLength(3);
    expect(older.incidentId).not.toBeNull();
    expect(newer.incidentId).not.toBeNull();

    expect(
      (await api(minji).post(`${base}/${older.incidentId}/resolve`, { note: 'x' })).status,
    ).toBe(403);
    const resolved = await json<Incident>(
      await api(nate).post(`${base}/${older.incidentId}/resolve`, {
        note: 'All three were in the lobby.',
      }),
    );
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedByName).toBe('Organizer');
    expect(resolved.resolutionNote).toBe('All three were in the lobby.');
    expect(resolved.resolvedAt).not.toBeNull();
    expect(
      (await api(nate).post(`${base}/${older.incidentId}/resolve`, { note: null })).status,
    ).toBe(409);
    expect(
      (await api(nate).post(`${base}/${crypto.randomUUID()}/resolve`, { note: null })).status,
    ).toBe(404);

    const list = await json<IncidentList>(await api(kim).get(base));
    expect(list.incidents.map((i) => [i.id, i.status])).toEqual([
      [newer.incidentId, 'open'],
      [older.incidentId, 'resolved'],
    ]);
    const byLeader = await json<Incident>(
      await api(kim).post(`${base}/${newer.incidentId}/resolve`, { note: null }),
    );
    expect(byLeader.resolvedByName).toBe('Kim');
  });

  it('leader confirms; organizer sends the guardian message; guardian sees own card only', async () => {
    const { kim, nate, minji, sora, byName, putHeadcount, base } = await setupTrip();
    // Minji (Sora's traveler) and Juho are missing on a whole-trip close; Hana is present.
    const sync = await json<SyncHeadcountResponse>(
      await putHeadcount(nate.token, crypto.randomUUID(), {
        openedAtDevice: '13:30',
        closedAtDevice: '13:35',
        groupName: null,
        marks: [{ participationId: byName('Lee, Hana'), mark: 'present' }],
      }),
    );
    const id = sync.incidentId as string;

    expect(
      (await api(minji).post(`${base}/${id}/confirm`, { status: 'with_group', note: null })).status,
    ).toBe(403);
    expect((await api(nate).post(`${base}/${id}/guardian-message`)).status).toBe(409);
    expect((await api(kim).post(`${base}/${id}/guardian-message`)).status).toBe(403);

    const confirmed = await json<Incident>(
      await api(kim).post(`${base}/${id}/confirm`, { status: 'with_group', note: 'Phone lost.' }),
    );
    expect(confirmed.confirmations).toHaveLength(1);
    expect(confirmed.confirmations[0]).toMatchObject({
      status: 'with_group',
      note: 'Phone lost.',
      confirmedByName: 'Kim',
      confirmedByRole: 'leader',
    });
    expect(confirmed.guardianMessage).toBeNull();

    const sent = await json<Incident>(await api(nate).post(`${base}/${id}/guardian-message`));
    const clock = /\b\d{2}:\d{2}\b/;
    expect(sent.guardianMessage?.bodyEn).toMatch(
      /^Juho Kim, Minji Park are with the group\. Phone lost\. Confirmed by leader Kim at \d{2}:\d{2}\.$/,
    );
    expect(sent.guardianMessage?.bodyKo).toMatch(
      /^Juho Kim, Minji Park 학생은 그룹과 함께 있습니다\. Phone lost\. 인솔자 Kim 님이 \d{2}:\d{2}에 확인했습니다\.$/,
    );
    expect(sent.guardianMessage?.bodyEn).toMatch(clock);
    expect(sent.guardianMessage?.sentByName).toBe('Organizer');

    // Guardian projection: own traveler only, generic title, no trail, message present.
    const forSora = await json<IncidentList>(await api(sora).get(base));
    expect(forSora.incidents).toHaveLength(1);
    expect(forSora.incidents[0]).toMatchObject({
      id,
      title: 'Status update about Minji Park',
      confirmations: [],
      resolutionNote: null,
    });
    expect(forSora.incidents[0]?.people.map((p) => p.displayName)).toEqual(['Minji Park']);
    expect(forSora.incidents[0]?.guardianMessage?.bodyKo).toContain('인솔자 Kim');
    expect(
      (await api(sora).post(`${base}/${id}/confirm`, { status: 'unknown', note: null })).status,
    ).toBe(403);

    // Resolved cards take no more confirmations.
    await api(nate).post(`${base}/${id}/resolve`, { note: null });
    expect(
      (await api(kim).post(`${base}/${id}/confirm`, { status: 'unknown', note: null })).status,
    ).toBe(409);
  });
});

describe('manual incidents (slice 068)', () => {
  it('the organizer opens a card by hand naming travelers; leaders and guardians hear it', async () => {
    const t = await setupTrip();
    const tripBase = t.base.replace(/\/incidents$/, '');
    const minjiId = t.byName('Minji Park');
    const opened = await json<Incident>(
      await api(t.nate).post(t.base, {
        title: 'Lost passport at the hotel desk',
        participationIds: [minjiId],
      }),
    );
    expect(opened).toMatchObject({
      kind: 'manual',
      status: 'open',
      title: 'Lost passport at the hotel desk',
      headcountId: null,
      openedByName: 'Owner',
    });
    expect(opened.people.map((p) => p.displayName)).toEqual(['Minji Park']);
    // A leader cannot open one; a guardian or an unknown id is not a traveler; blank is 400.
    expect(
      (await api(t.kim).post(t.base, { title: 'x', participationIds: [minjiId] })).status,
    ).toBe(403);
    expect(
      (await api(t.nate).post(t.base, { title: 'x', participationIds: [t.byName('Sora Park')] }))
        .status,
    ).toBe(404);
    expect(
      (await api(t.nate).post(t.base, { title: 'x', participationIds: [crypto.randomUUID()] }))
        .status,
    ).toBe(404);
    expect(
      (await api(t.nate).post(t.base, { title: '  ', participationIds: [minjiId] })).status,
    ).toBe(400);
    expect((await api(t.nate).post(t.base, { title: 'x', participationIds: [] })).status).toBe(400);
    // The list leads with it; Kim (Bus A's leader) and Sora (Minji's guardian) hear "Incident opened".
    const list = await json<IncidentList>(await api(t.nate).get(t.base));
    expect(list.incidents[0]?.id).toBe(opened.id);
    const inbox = async (c: Parameters<typeof api>[0]) =>
      (
        await json<MyNotifications>(await api(c).get(`${tripBase}/notifications/mine`))
      ).notifications.map((n) => [n.kind, n.title, n.refId]);
    expect(await inbox(t.kim)).toContainEqual([
      'incident_status',
      'Incident opened: Minji Park',
      opened.id,
    ]);
    expect(await inbox(t.sora)).toContainEqual([
      'incident_status',
      'Incident opened: Minji Park',
      opened.id,
    ]);
    expect(await inbox(t.minji)).toEqual([]);
    const forSora = await json<IncidentList>(await api(t.sora).get(t.base));
    expect(forSora.incidents.map((i) => [i.id, i.title])).toEqual([
      [opened.id, 'Status update about Minji Park'],
    ]);
    // The rest is the head count card's flow: Kim confirms, the organizer messages and resolves.
    expect(
      (
        await api(t.kim).post(`${t.base}/${opened.id}/confirm`, {
          status: 'with_group',
          note: 'The desk had it.',
        })
      ).status,
    ).toBe(200);
    expect((await api(t.nate).post(`${t.base}/${opened.id}/guardian-message`)).status).toBe(200);
    const resolved = await json<Incident>(
      await api(t.nate).post(`${t.base}/${opened.id}/resolve`, {
        note: 'Passport back with Minji.',
      }),
    );
    expect(resolved.status).toBe('resolved');
  });
});
