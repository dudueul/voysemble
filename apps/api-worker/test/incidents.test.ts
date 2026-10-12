// Copyright 2026- At Day. All rights reserved.
// Facts: a head count closed with missing travelers opens exactly one incident naming them (a
// replay of the closed session returns the same id); a clean close opens none; the list puts
// open cards first; staff resolve with a note (second resolve 409, unknown id 404); travelers
// get 403 on list and resolve. Slice 016: a leader confirms with a note (traveler 403); the
// organizer sends the guardian message composed in both languages from the latest confirmation
// (409 before any confirmation; leaders cannot send); the guardian lists only their traveler's
// card, projected, with the message; a resolved card takes no confirmation. Slice 068: the
// organizer opens a card by hand naming travelers; leaders and guardians hear it; a leader,
// a guardian id, an unknown id and a blank title are refused; the flow continues as usual. Slice
// 073: a leader opens one from the phone for travelers of their group, by their own name. Slice
// 074: a traveler asks for help for themselves (kind help); their leader and guardian hear it;
// they read their own cards, projected. Slice 076: a card opened from a phone reaches the owner's
// mailbox at once (not one the organizer opened on the console); a traveler asks once while a
// request is open. Slice 078: a head count that closes with people missing mails the owner too,
// once (the replay and a clean close send nothing). Slice 081: an owner who turned the incident
// emails off hears nothing more while the lanes still run.

import { env } from 'cloudflare:test';
import type {
  Incident,
  IncidentList,
  IssueInvitesResponse,
  MyNotifications,
  RosterImportResponse,
  SyncHeadcountResponse,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { FixtureEmailPort } from '../src/email/EmailPort';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

/** The newest message in the fixture mailbox for an address (slice 076). */
function latestMail(to: string) {
  if (!env.DEV_MAILBOX) throw new Error('DEV_MAILBOX missing in test env');
  return FixtureEmailPort.latest(env.DEV_MAILBOX, to);
}

/** How many messages the fixture mailbox holds for an address (slice 078). */
async function mailCount(to: string): Promise<number> {
  if (!env.DEV_MAILBOX) throw new Error('DEV_MAILBOX missing in test env');
  return (await env.DEV_MAILBOX.list({ prefix: `mail:${to}:` })).keys.length;
}

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
    const { kim, nate, minji, byName, putHeadcount, base, trip } = await setupTrip();
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
    // Slice 078: the owner's mailbox gets the card at once; the replay and a clean close add none.
    const mail = await latestMail('nate-inc@example.com');
    expect([mail?.tag, mail?.locale, mail?.subject]).toEqual([
      'incident',
      'en',
      `${trip.name}: head count closed with 1 missing · Juho Kim`,
    ]);
    expect(mail?.text).toContain('leader Kim closed the head count with 1 missing');
    expect(mail?.text).toContain('Head count closed with 1 missing (Bus A, 06:58)');
    expect(mail?.text).toContain('/safety');
    const mails = await mailCount('nate-inc@example.com');
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
    expect(await mailCount('nate-inc@example.com')).toBe(mails);

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

    // Slice 074: a traveler lists the cards naming them; this one names Juho, not Minji.
    expect(await json<IncidentList>(await api(minji).get(base))).toEqual({ incidents: [] });
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
    // Slice 076: a card the organizer opened on the console sends no email to the organizers.
    expect((await latestMail('nate-inc@example.com'))?.tag).toBe('magic-link');
    // Slice 073: Kim (Bus A's leader) opens one naming Minji (Bus A), by her own name; Hana (Bus
    // B) is outside her group; a traveler names only themselves, a guardian cannot open one.
    const byKim = await json<Incident>(
      await api(t.kim).post(t.base, { title: 'Minji feels sick', participationIds: [minjiId] }),
    );
    expect(byKim).toMatchObject({ kind: 'manual', status: 'open', openedByName: 'Kim' });
    // Slice 076: Kim's card from the phone reaches the owner's mailbox at once, in his language.
    const kimsMail = await latestMail('nate-inc@example.com');
    expect([kimsMail?.tag, kimsMail?.locale, kimsMail?.subject]).toEqual([
      'incident',
      'en',
      `${t.trip.name}: incident opened by Kim · Minji Park`,
    ]);
    expect(kimsMail?.text).toContain('Minji feels sick');
    expect(kimsMail?.text).toContain('leader Kim opened an incident from the phone');
    expect(kimsMail?.text).toContain('/safety');
    // Slice 081: the owner turns the incident emails off; Kim's next card mails nobody.
    expect((await api(t.nate).patch('/v1/me', { incidentEmails: false })).status).toBe(200);
    const mailsBefore = await mailCount('nate-inc@example.com');
    const quiet = await json<Incident>(
      await api(t.kim).post(t.base, {
        title: 'Juho feels sick',
        participationIds: [t.byName('Juho Kim')],
      }),
    );
    expect(await mailCount('nate-inc@example.com')).toBe(mailsBefore);
    expect((await api(t.nate).post(`${t.base}/${quiet.id}/resolve`, { note: null })).status).toBe(
      200,
    );
    expect((await api(t.nate).patch('/v1/me', { incidentEmails: true })).status).toBe(200);
    expect(
      (await api(t.kim).post(t.base, { title: 'x', participationIds: [t.byName('Lee, Hana')] }))
        .status,
    ).toBe(403);
    // Slice 074: a traveler names only themselves (Minji naming Juho is refused); a guardian never.
    expect(
      (await api(t.minji).post(t.base, { title: 'x', participationIds: [t.byName('Juho Kim')] }))
        .status,
    ).toBe(403);
    expect(
      (await api(t.sora).post(t.base, { title: 'x', participationIds: [minjiId] })).status,
    ).toBe(403);
    expect((await api(t.nate).post(`${t.base}/${byKim.id}/resolve`, { note: null })).status).toBe(
      200,
    );
    // A guardian or an unknown id is not a traveler; blank is 400.
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
    // Both cards about Minji, the open one first, each as a status update (slice 073: Kim's too).
    expect(forSora.incidents.map((i) => [i.id, i.title, i.status])).toEqual([
      [opened.id, 'Status update about Minji Park', 'open'],
      [byKim.id, 'Status update about Minji Park', 'resolved'],
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

describe('help from the phone (slice 074)', () => {
  it('a traveler asks for help for themselves; the leader and the guardian hear it; the traveler reads their own card', async () => {
    const t = await setupTrip();
    const tripBase = t.base.replace(/\/incidents$/, '');
    const minjiId = t.byName('Minji Park');
    const juhoId = t.byName('Juho Kim');
    // Only themselves: naming someone else, or someone else too, is refused.
    expect(
      (await api(t.minji).post(t.base, { title: 'x', participationIds: [juhoId] })).status,
    ).toBe(403);
    expect(
      (await api(t.minji).post(t.base, { title: 'x', participationIds: [minjiId, juhoId] })).status,
    ).toBe(403);
    const card = await json<Incident>(
      await api(t.minji).post(t.base, { title: 'I feel sick', participationIds: [minjiId] }),
    );
    expect(card).toMatchObject({
      kind: 'help',
      status: 'open',
      title: 'I feel sick',
      headcountId: null,
      openedByName: 'Minji Park',
    });
    expect(card.people.map((p) => p.displayName)).toEqual(['Minji Park']);
    // Slice 076: the owner's mailbox hears it at once; a second request while one is open is 409.
    const mail = await latestMail('nate-inc@example.com');
    expect([mail?.tag, mail?.locale, mail?.subject]).toEqual([
      'incident',
      'en',
      `${t.trip.name}: Minji Park asked for help`,
    ]);
    expect(mail?.text).toContain('I feel sick');
    expect(mail?.text).toContain('Minji Park asked for help from the phone');
    expect(mail?.text).toContain('/safety');
    expect(
      (await api(t.minji).post(t.base, { title: 'again', participationIds: [minjiId] })).status,
    ).toBe(409);
    // Kim (Bus A's leader) and Sora (Minji's guardian) hear "Help asked"; Minji herself nothing.
    const inbox = async (c: Parameters<typeof api>[0]) =>
      (
        await json<MyNotifications>(await api(c).get(`${tripBase}/notifications/mine`))
      ).notifications.map((n) => [n.kind, n.title, n.refId]);
    expect(await inbox(t.kim)).toContainEqual([
      'incident_status',
      'Help asked: Minji Park',
      card.id,
    ]);
    expect(await inbox(t.sora)).toContainEqual([
      'incident_status',
      'Help asked: Minji Park',
      card.id,
    ]);
    expect(await inbox(t.minji)).toEqual([]);
    // Minji reads her own card, projected: her words, herself alone, no trail.
    const mine = await json<IncidentList>(await api(t.minji).get(t.base));
    expect(
      mine.incidents.map((i) => [
        i.id,
        i.title,
        i.status,
        i.people.map((p) => p.displayName),
        i.confirmations.length,
      ]),
    ).toEqual([[card.id, 'I feel sick', 'open', ['Minji Park'], 0]]);
    // The leader confirms, the organizer messages the guardian and resolves; Minji sees it
    // resolved, without the note or the guardian message; Sora reads the status update.
    expect(
      (
        await api(t.kim).post(`${t.base}/${card.id}/confirm`, {
          status: 'with_group',
          note: 'Resting on the bus.',
        })
      ).status,
    ).toBe(200);
    expect((await api(t.nate).post(`${t.base}/${card.id}/guardian-message`)).status).toBe(200);
    expect(
      (await api(t.nate).post(`${t.base}/${card.id}/resolve`, { note: 'Felt better after lunch.' }))
        .status,
    ).toBe(200);
    const after = await json<IncidentList>(await api(t.minji).get(t.base));
    expect(
      after.incidents.map((i) => [
        i.id,
        i.status,
        i.resolutionNote,
        i.guardianMessage,
        i.confirmations.length,
      ]),
    ).toEqual([[card.id, 'resolved', null, null, 0]]);
    const forSora = await json<IncidentList>(await api(t.sora).get(t.base));
    expect(forSora.incidents.map((i) => [i.id, i.title, i.guardianMessage !== null])).toEqual([
      [card.id, 'Status update about Minji Park', true],
    ]);
    // The organizer's list carries the kind; a traveler still cannot resolve or confirm.
    const all = await json<IncidentList>(await api(t.nate).get(t.base));
    expect(all.incidents.map((i) => [i.id, i.kind, i.openedByName])).toEqual([
      [card.id, 'help', 'Minji Park'],
    ]);
    expect((await api(t.minji).post(`${t.base}/${card.id}/resolve`, { note: null })).status).toBe(
      403,
    );
    // Resolved: she may ask again (slice 076).
    expect(
      (await api(t.minji).post(t.base, { title: 'Lost my bag', participationIds: [minjiId] }))
        .status,
    ).toBe(201);
  });
});
