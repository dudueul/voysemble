// Copyright 2026- At Day. All rights reserved.
// Facts: organizers and participating leaders publish; members list; guardians see only shared
// items; travelers ack once (replays are idempotent); guardians and non-participants cannot ack;
// ack status names the unacked; cross-org is 403; non-ack announcements reject acks.

import type {
  AckStatus,
  Announcement,
  IssueInvitesResponse,
  RosterImportResponse,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

async function setupTrip() {
  const nate = await signIn('nate@example.com');
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
  const minji = await signIn('minji@example.com');
  await api(minji).post('/v1/invites/redeem', { code: codeFor('Minji Park') });
  const sora = await signIn('sora@example.com');
  await api(sora).post('/v1/invites/redeem', { code: codeFor('Sora Park') });
  const kim = await signIn('kim@example.com');
  await api(kim).post('/v1/invites/redeem', { code: codeFor('Kim') });
  const base = `/v1/orgs/${org.id}/trips/${trip.id}/announcements`;
  return { nate, minji, sora, kim, org, trip, base, imported };
}

describe('announcements', () => {
  it('organizer publishes; traveler, leader, and guardian see the right items', async () => {
    const { nate, minji, sora, kim, base } = await setupTrip();
    const a1 = await json<Announcement>(
      await api(nate).post(base, {
        title: 'Breakfast 06:30',
        body: 'Lobby. Bus 07:15.',
        requiresAck: true,
        sharedWithGuardians: true,
      }),
    );
    expect(a1.ackTotal).toBe(4); // 3 travelers + 1 leader
    expect(a1.ackCount).toBe(0);
    expect(a1.authorName).toBe('Organizer');
    const a2 = await json<Announcement>(
      await api(kim).post(base, { title: 'Seats', body: 'Choir in rows 1-4.', requiresAck: false }),
    );
    expect(a2.authorName).toBe('Kim');
    expect(a2.sharedWithGuardians).toBe(false);

    const forMinji = await json<{ announcements: Announcement[] }>(await api(minji).get(base));
    expect(forMinji.announcements.map((a) => a.title)).toEqual(['Seats', 'Breakfast 06:30']);
    const forSora = await json<{ announcements: Announcement[] }>(await api(sora).get(base));
    expect(forSora.announcements.map((a) => a.title)).toEqual(['Breakfast 06:30']);
  });

  it('traveler acks once; replay is idempotent; status lists the rest; guardian cannot ack', async () => {
    const { nate, minji, sora, kim, base } = await setupTrip();
    const a = await json<Announcement>(
      await api(nate).post(base, {
        title: 'Ack me',
        body: 'Please.',
        requiresAck: true,
        sharedWithGuardians: true,
      }),
    );
    const first = await api(minji).post(`${base}/${a.id}/ack`, {
      ackedAtDevice: '2026-12-31T05:50:00.000Z',
    });
    expect(first.status).toBe(200);
    const r1 = await json<{ created: boolean; receivedAt: string }>(first);
    expect(r1.created).toBe(true);
    const replay = await json<{ created: boolean; receivedAt: string }>(
      await api(minji).post(`${base}/${a.id}/ack`, { ackedAtDevice: '2026-12-31T05:51:00.000Z' }),
    );
    expect(replay.created).toBe(false);
    expect(replay.receivedAt).toBe(r1.receivedAt);

    const mine = await json<{ announcements: Announcement[] }>(await api(minji).get(base));
    expect(mine.announcements[0]?.myAck).toBe('acknowledged');
    expect(mine.announcements[0]?.ackCount).toBe(1);

    expect(
      (await api(sora).post(`${base}/${a.id}/ack`, { ackedAtDevice: '2026-12-31T05:52:00.000Z' }))
        .status,
    ).toBe(403);
    expect(
      (await api(nate).post(`${base}/${a.id}/ack`, { ackedAtDevice: '2026-12-31T05:52:00.000Z' }))
        .status,
    ).toBe(403);

    const status = await json<AckStatus>(await api(kim).get(`${base}/${a.id}/acks`));
    expect(status.acked.map((e) => e.displayName)).toEqual(['Minji Park']);
    expect(status.unacked.map((e) => e.displayName).sort()).toEqual([
      'Juho Kim',
      'Kim',
      'Lee, Hana',
    ]);
    expect((await api(minji).get(`${base}/${a.id}/acks`)).status).toBe(403);
  });

  it('non-ack announcements reject acks; unknown ids 404; other org 403; member cannot publish', async () => {
    const { nate, minji, base, org, trip } = await setupTrip();
    const a = await json<Announcement>(
      await api(nate).post(base, { title: 'FYI', body: 'No ack.', requiresAck: false }),
    );
    expect(
      (await api(minji).post(`${base}/${a.id}/ack`, { ackedAtDevice: '2026-12-31T05:50:00.000Z' }))
        .status,
    ).toBe(400);
    expect(
      (
        await api(minji).post(`${base}/${crypto.randomUUID()}/ack`, {
          ackedAtDevice: '2026-12-31T05:50:00.000Z',
        })
      ).status,
    ).toBe(404);
    expect((await api(minji).post(base, { title: 'x', body: 'y' })).status).toBe(403);
    const other = await signIn('other@example.com');
    expect((await api(other).get(base)).status).toBe(403);
    expect(
      (await api(nate).get(`/v1/orgs/${org.id}/trips/${crypto.randomUUID()}/announcements`)).status,
    ).toBe(404);
    expect(trip.id).toBeTruthy();
  });
});
