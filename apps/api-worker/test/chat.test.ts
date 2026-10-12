// Copyright 2026- At Day. All rights reserved.
// Facts (D22): channel ids and membership follow the matrix (pure helpers); each role lists its
// own channels; a traveler's trip message reaches the leader and the organizer; a guardian is
// kept out of the trip and group channels; a traveler-leader channel is closed to another
// traveler and to the other group's leader; the organizer and a guardian exchange messages with
// unread counts that reset on open; a group channel is closed to the organizer unless an open
// incident names one of its travelers (slice 064: then read-only and audited on every traveler's
// timeline in the channel, closed again once resolved); the cards' words follow the reader's
// account language; an unknown channel is 404 and an empty body 400.

import {
  type ChatChannelList,
  type ChatMessage,
  type ChatMessageList,
  channelIdFor,
  channelMembersOf,
  type Incident,
  type PersonTimeline,
  parseChannelId,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

async function setupTrip() {
  const nate = await signIn('nate@example.com');
  const org = await createOrg(nate);
  const trip = await createTrip(nate, org.id);
  const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
  await api(nate).post(`${base}/roster/import`, { csv: SAMPLE_CSV });
  await api(nate).post(`${base}/roster/leaders`, { displayName: 'Kim', groupName: 'Bus A' });
  await api(nate).post(`${base}/roster/leaders`, { displayName: 'Choi', groupName: 'Bus B' });
  const issued = await json<{
    invites: { displayName: string; code: string; participationId: string }[];
  }>(await api(nate).post(`${base}/invites`));
  const invite = (name: string) => issued.invites.find((i) => i.displayName === name);
  const redeem = async (email: string, name: string) => {
    const c = await signIn(email);
    expect((await api(c).post('/v1/invites/redeem', { code: invite(name)?.code })).status).toBe(
      200,
    );
    return c;
  };
  return {
    nate,
    kim: await redeem('kim@example.com', 'Kim'),
    choi: await redeem('choi@example.com', 'Choi'),
    minji: await redeem('minji@example.com', 'Minji Park'),
    juho: await redeem('juho@example.com', 'Juho Kim'),
    hana: await redeem('hana@example.com', 'Lee, Hana'),
    sora: await redeem('sora@example.com', 'Sora Park'),
    base,
    id: (name: string) => invite(name)?.participationId ?? '',
  };
}

const channels = async (c: Parameters<typeof api>[0], base: string) =>
  (await json<ChatChannelList>(await api(c).get(`${base}/chats`))).channels;

describe('chat channels (slice 033)', () => {
  it('ids and membership follow the matrix', () => {
    const roster = [
      { id: 'kim', role: 'leader', groupName: 'Bus A', guardianOf: null },
      { id: 'lee', role: 'leader', groupName: null, guardianOf: null },
      { id: 'minji', role: 'traveler', groupName: 'Bus A', guardianOf: null },
      { id: 'hana', role: 'traveler', groupName: 'Bus B', guardianOf: null },
      { id: 'sora', role: 'guardian', groupName: 'Bus A', guardianOf: 'minji' },
    ];
    expect(channelIdFor('group', 'Bus A')).toBe('group:Bus A');
    expect(parseChannelId('traveler:minji')).toEqual({ kind: 'traveler', key: 'minji' });
    expect(parseChannelId('dm:x')).toBeNull();
    expect([...channelMembersOf({ kind: 'trip', key: '' }, roster).members].sort()).toEqual([
      'hana',
      'kim',
      'lee',
      'minji',
    ]);
    expect([...channelMembersOf({ kind: 'group', key: 'Bus B' }, roster).members].sort()).toEqual([
      'hana',
      'lee',
    ]);
    expect(
      [...channelMembersOf({ kind: 'traveler', key: 'minji' }, roster).members].sort(),
    ).toEqual(['kim', 'lee', 'minji']);
    const sora = channelMembersOf({ kind: 'guardian', key: 'sora' }, roster);
    expect([...sora.members]).toEqual(['sora']);
    expect(sora.organizers).toBe(true);
    expect(channelMembersOf({ kind: 'group', key: 'Bus Z' }, roster).exists).toBe(false);
  });

  it('each role lists its channels; messages flow only inside the matrix', async () => {
    const t = await setupTrip();
    const minjiId = t.id('Minji Park');
    const soraId = t.id('Sora Park');

    // Lists.
    expect((await channels(t.nate, t.base)).map((c) => c.id).sort()).toEqual(
      ['trip', `guardian:${t.id('Hana Mom')}`, `guardian:${soraId}`].sort(),
    );
    expect((await channels(t.kim, t.base)).map((c) => c.id).sort()).toEqual(
      ['trip', 'group:Bus A', `traveler:${t.id('Juho Kim')}`, `traveler:${minjiId}`].sort(),
    );
    const minjiList = await channels(t.minji, t.base);
    expect(minjiList.map((c) => c.id)).toEqual(['trip', 'group:Bus A', `traveler:${minjiId}`]);
    expect(minjiList[2]).toMatchObject({
      kind: 'traveler',
      title: 'Your leaders',
      subtitle: 'with Kim',
      unread: 0,
    });
    const soraList = await channels(t.sora, t.base);
    expect(soraList.map((c) => c.id)).toEqual([`guardian:${soraId}`]);
    expect(soraList[0]).toMatchObject({
      title: 'The organizer',
      subtitle: 'with the trip organizer',
    });

    // Trip channel: a traveler writes, the leader and the organizer read, the guardian is out.
    const sent = await json<ChatMessage>(
      await api(t.minji).post(`${t.base}/chats/trip/messages`, { body: 'Bus A is at the gate.' }),
    );
    expect(sent).toMatchObject({
      channelId: 'trip',
      senderName: 'Minji Park',
      senderRole: 'traveler',
      mine: true,
    });
    const kimTrip = await json<ChatMessageList>(
      await api(t.kim).get(`${t.base}/chats/trip/messages`),
    );
    expect(kimTrip.messages.map((m) => [m.body, m.mine])).toEqual([
      ['Bus A is at the gate.', false],
    ]);
    expect((await api(t.nate).get(`${t.base}/chats/trip/messages`)).status).toBe(200);
    expect((await api(t.sora).get(`${t.base}/chats/trip/messages`)).status).toBe(403);
    expect((await api(t.sora).post(`${t.base}/chats/trip/messages`, { body: 'hi' })).status).toBe(
      403,
    );

    // Traveler-leader channel: Minji and Kim only.
    const dm = `${t.base}/chats/${encodeURIComponent(`traveler:${minjiId}`)}/messages`;
    expect((await api(t.minji).post(dm, { body: 'I feel sick.' })).status).toBe(201);
    expect((await api(t.kim).get(dm)).status).toBe(200);
    expect((await api(t.choi).get(dm)).status).toBe(403);
    expect((await api(t.juho).get(dm)).status).toBe(403);
    expect((await api(t.nate).get(dm)).status).toBe(403);

    // Guardian-organizer channel with unread counts.
    const gch = `${t.base}/chats/${encodeURIComponent(`guardian:${soraId}`)}/messages`;
    expect((await api(t.sora).post(gch, { body: 'Will the bus be late?' })).status).toBe(201);
    const nateList = await channels(t.nate, t.base);
    expect(nateList.find((c) => c.id === `guardian:${soraId}`)).toMatchObject({
      unread: 1,
      title: 'Sora Park',
      subtitle: 'guardian of Minji Park',
    });
    expect(nateList.find((c) => c.id === `guardian:${soraId}`)?.lastMessage?.body).toBe(
      'Will the bus be late?',
    );
    const opened = await json<ChatMessageList>(await api(t.nate).get(gch));
    expect(opened.channel.unread).toBe(0);
    expect(opened.messages).toHaveLength(1);
    expect(
      (await channels(t.nate, t.base)).find((c) => c.id === `guardian:${soraId}`)?.unread,
    ).toBe(0);
    const reply = await json<ChatMessage>(
      await api(t.nate).post(gch, { body: 'Ten minutes, all fine.' }),
    );
    expect(reply).toMatchObject({ senderName: 'Owner', senderRole: 'owner', mine: true });
    expect((await channels(t.sora, t.base))[0]?.unread).toBe(1);
    expect((await api(t.kim).get(gch)).status).toBe(403);

    // Group channel: the other group's leader and the organizer are out.
    const busB = `${t.base}/chats/${encodeURIComponent('group:Bus B')}/messages`;
    expect((await api(t.hana).post(busB, { body: 'Where is the bus?' })).status).toBe(201);
    expect((await api(t.choi).get(busB)).status).toBe(200);
    expect((await api(t.kim).get(busB)).status).toBe(403);
    expect((await api(t.nate).get(busB)).status).toBe(403);

    // Bad input.
    expect((await api(t.minji).get(`${t.base}/chats/nope/messages`)).status).toBe(404);
    expect(
      (await api(t.minji).get(`${t.base}/chats/${encodeURIComponent('group:Bus Z')}/messages`))
        .status,
    ).toBe(404);
    expect((await api(t.minji).post(`${t.base}/chats/trip/messages`, { body: '   ' })).status).toBe(
      400,
    );
  });
});

describe("chat in the reader's language and the audited read on an incident (slice 064)", () => {
  it("words follow the account language; the organizer reads a named traveler's channels while the incident is open", async () => {
    const t = await setupTrip();
    const minjiId = t.id('Minji Park');
    const juhoId = t.id('Juho Kim');
    const titles = async (c: Parameters<typeof api>[0]) =>
      (await json<ChatChannelList>(await api(c).get(`${t.base}/chats`))).channels.map((ch) => [
        ch.id,
        ch.title,
        ch.subtitle,
      ]);
    // Nate switches his account to Korean: his cards speak it; Minji's stay English.
    expect((await api(t.nate).patch('/v1/me', { locale: 'ko' })).status).toBe(200);
    expect(await titles(t.nate)).toEqual([
      ['trip', '여행 전체', '여행자 3명 · 인솔자 2명 · 주최자'],
      [`guardian:${t.id('Sora Park')}`, 'Sora Park', 'Minji Park의 보호자'],
      [`guardian:${t.id('Hana Mom')}`, 'Hana Mom', 'Lee, Hana의 보호자'],
    ]);
    expect(await titles(t.minji)).toEqual([
      ['trip', 'Everyone on the trip', '3 travelers · 2 leaders · the organizer'],
      ['group:Bus A', 'Bus A', '2 travelers · 1 leader'],
      [`traveler:${minjiId}`, 'Your leaders', 'with Kim'],
    ]);
    expect((await api(t.sora).patch('/v1/me', { locale: 'ko' })).status).toBe(200);
    expect(await titles(t.sora)).toEqual([
      [`guardian:${t.id('Sora Park')}`, '주최자', '여행 주최자와의 대화'],
    ]);
    expect((await api(t.nate).patch('/v1/me', { locale: 'en' })).status).toBe(200);

    // Without an incident the organizer is kept out of the group and traveler channels.
    const busA = `${t.base}/chats/${encodeURIComponent('group:Bus A')}/messages`;
    const juhoCh = `${t.base}/chats/traveler:${juhoId}/messages`;
    const minjiCh = `${t.base}/chats/traveler:${minjiId}/messages`;
    expect((await api(t.nate).get(busA)).status).toBe(403);
    expect((await api(t.nate).get(juhoCh)).status).toBe(403);
    expect((await api(t.kim).post(busA, { body: 'Juho went to find the toilets.' })).status).toBe(
      201,
    );
    expect(
      (await api(t.juho).post(juhoCh, { body: 'Back at gate 3 in two minutes.' })).status,
    ).toBe(201);

    // Kim closes a head count with Juho unmarked: an incident names him.
    const sync = await json<{ incidentId: string | null }>(
      await api(t.kim).put(`${t.base}/headcounts/${crypto.randomUUID()}`, {
        openedAtDevice: '06:50',
        closedAtDevice: '06:58',
        groupName: 'Bus A',
        marks: [{ participationId: minjiId, mark: 'present' }],
      }),
    );
    expect(sync.incidentId).not.toBeNull();
    const incidentId = sync.incidentId ?? '';

    // The organizer reads Bus A and Juho's channel, audited; not Minji's, not Bus B; never writes.
    const group = await json<ChatMessageList>(await api(t.nate).get(busA));
    expect(group.channel).toMatchObject({
      id: 'group:Bus A',
      title: 'Bus A',
      subtitle: '2 travelers · 1 leader',
      unread: 0,
    });
    expect(group.messages.map((m) => [m.senderName, m.body, m.mine])).toEqual([
      ['Kim', 'Juho went to find the toilets.', false],
    ]);
    expect(group.audited).toEqual({
      incidentId,
      incidentTitle: 'Head count closed with 1 missing (Bus A, 06:58)',
    });
    const dm = await json<ChatMessageList>(await api(t.nate).get(juhoCh));
    expect(dm.channel).toMatchObject({ title: 'Juho Kim', subtitle: 'with Juho Kim · Bus A' });
    expect(dm.messages.map((m) => m.body)).toEqual(['Back at gate 3 in two minutes.']);
    expect(dm.audited?.incidentId).toBe(incidentId);
    expect((await api(t.nate).get(minjiCh)).status).toBe(403);
    expect(
      (await api(t.nate).get(`${t.base}/chats/${encodeURIComponent('group:Bus B')}/messages`))
        .status,
    ).toBe(403);
    expect((await api(t.nate).post(busA, { body: 'Hello from the desk' })).status).toBe(403);
    // A member's own read is not audited.
    expect((await json<ChatMessageList>(await api(t.kim).get(busA))).audited).toBeUndefined();

    // Every traveler in the channel carries the fact: Juho twice (group and his own), Minji once.
    const timeline = async (id: string) =>
      (
        await json<PersonTimeline>(await api(t.nate).get(`${t.base}/people/${id}/timeline`))
      ).entries.filter((e) => e.kind === 'chat_audited_read');
    const juhoFacts = await timeline(juhoId);
    expect(juhoFacts.map((e) => [e.title, e.detail, e.ref])).toEqual([
      [
        'Channel "Juho Kim" read by Owner (audited)',
        'During the incident: Head count closed with 1 missing (Bus A, 06:58)',
        { type: 'incident', id: incidentId },
      ],
      [
        'Channel "Bus A" read by Owner (audited)',
        'During the incident: Head count closed with 1 missing (Bus A, 06:58)',
        { type: 'incident', id: incidentId },
      ],
    ]);
    expect((await timeline(minjiId)).map((e) => e.title)).toEqual([
      'Channel "Bus A" read by Owner (audited)',
    ]);

    // Resolved: the door closes again.
    const resolved = await json<Incident>(
      await api(t.nate).post(`${t.base}/incidents/${incidentId}/resolve`, {
        note: 'Found at the gate.',
      }),
    );
    expect(resolved.status).toBe('resolved');
    expect((await api(t.nate).get(busA)).status).toBe(403);
    expect((await api(t.nate).get(juhoCh)).status).toBe(403);
  });
});
