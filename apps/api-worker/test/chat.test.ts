// Copyright 2026- At Day. All rights reserved.
// Facts (D22): channel ids and membership follow the matrix (pure helpers); each role lists its
// own channels; a traveler's trip message reaches the leader and the organizer; a guardian is
// kept out of the trip and group channels; a traveler-leader channel is closed to another
// traveler and to the other group's leader; the organizer and a guardian exchange messages with
// unread counts that reset on open; a group channel is closed to the organizer (reading on
// incident is a later slice); an unknown channel is 404 and an empty body 400.

import {
  type ChatChannelList,
  type ChatMessage,
  type ChatMessageList,
  channelIdFor,
  channelMembersOf,
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
