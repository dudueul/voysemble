// Copyright 2026- At Day. All rights reserved.
// Facts (D29, slice 088): a phone registers one push token per session (a second token replaces
// the first; anonymous 401; a bad body 400) and removes it; a head count call reaches the
// traveler's phone at once with the notification's title, lane and reference; a guardian's dead
// token is forgotten when the incident's push answers invalid; quiet hours hold a normal row
// until a later run, which sends it; a row more than six hours late is marked stale and not
// sent; without keys the rows are marked unconfigured; logout removes the device.

import { env } from 'cloudflare:test';
import type { IssueInvitesResponse, RosterImportResponse } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { runPushes } from '../src/lib/push';
import { localClock } from '../src/lib/time';
import { FixturePushPort, UnconfiguredPushPort } from '../src/push/PushPort';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

function mailbox(): KVNamespace {
  if (!env.DEV_MAILBOX) throw new Error('DEV_MAILBOX missing in test env');
  return env.DEV_MAILBOX;
}

async function devicesWithToken(token: string): Promise<number> {
  const r = await env.DB.prepare('SELECT count(*) AS n FROM push_devices WHERE token = ?')
    .bind(token)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

describe('push devices and the push run (slice 088)', () => {
  it('registers, replaces and removes one token per session', async () => {
    const minji = await signIn('minji-push-a@example.com');
    const first = await api(minji).put('/v1/me/push-device', {
      platform: 'android',
      token: 'fcm-token-aaaaaaaa',
    });
    expect(first.status).toBe(200);
    expect((await json<{ platform: string }>(first)).platform).toBe('android');
    expect(
      (
        await api(minji).put('/v1/me/push-device', {
          platform: 'android',
          token: 'fcm-token-bbbbbbbb',
        })
      ).status,
    ).toBe(200);
    expect(await devicesWithToken('fcm-token-aaaaaaaa')).toBe(0);
    expect(await devicesWithToken('fcm-token-bbbbbbbb')).toBe(1);
    expect(
      (await api(minji).put('/v1/me/push-device', { platform: 'web', token: 'x' })).status,
    ).toBe(400);
    expect(
      (await api(null).put('/v1/me/push-device', { platform: 'ios', token: 'apns-12345678' }))
        .status,
    ).toBe(401);
    expect(await json<{ removed: number }>(await api(minji).delete('/v1/me/push-device'))).toEqual({
      removed: 1,
    });
    expect(await devicesWithToken('fcm-token-bbbbbbbb')).toBe(0);
  });

  it('delivers by lane, forgets dead tokens, holds quiet hours, skips stale rows, stops at logout', async () => {
    const nate = await signIn('nate-push@example.com');
    const org = await createOrg(nate);
    const trip = await createTrip(nate, org.id);
    const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
    const imported = await json<RosterImportResponse>(
      await api(nate).post(`${base}/roster/import`, { csv: SAMPLE_CSV }),
    );
    await api(nate).post(`${base}/roster/leaders`, { displayName: 'Kim', groupName: 'Bus A' });
    const issued = await json<IssueInvitesResponse>(await api(nate).post(`${base}/invites`));
    const redeem = async (email: string, name: string) => {
      const c = await signIn(email);
      const code = issued.invites.find((i) => i.displayName === name)?.code;
      expect((await api(c).post('/v1/invites/redeem', { code })).status).toBe(200);
      return c;
    };
    const kim = await redeem('kim-push@example.com', 'Kim');
    const minji = await redeem('minji-push@example.com', 'Minji Park');
    const sora = await redeem('sora-push@example.com', 'Sora Park');
    const byName = (n: string) =>
      imported.participations.find((p) => p.displayName === n)?.id ?? '';
    // No quiet hours to start with (a zero-length window).
    await api(nate).patch(`/v1/orgs/${org.id}`, {
      settings: { quietHours: { from: '09:00', to: '09:00' } },
    });
    await api(kim).put('/v1/me/push-device', {
      platform: 'ios',
      token: 'apns-kim-0001',
      apnsEnvironment: 'sandbox',
    });
    await api(minji).put('/v1/me/push-device', { platform: 'android', token: 'fcm-minji-0001' });
    await api(sora).put('/v1/me/push-device', { platform: 'android', token: 'dead-sora-0001' });

    // A head count call reaches Minji's phone at once: priority lane, the title, the reference.
    const hc = crypto.randomUUID();
    const { SELF } = await import('cloudflare:test');
    const putHeadcount = (body: unknown) =>
      SELF.fetch(`https://example.com${base}/headcounts/${hc}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${kim.token}` },
        body: JSON.stringify(body),
      });
    await putHeadcount({
      openedAtDevice: '06:50',
      closedAtDevice: null,
      groupName: 'Bus A',
      marks: [],
    });
    const minjis = await FixturePushPort.all(mailbox(), 'fcm-minji-0001');
    expect(minjis.map((m) => [m.lane, m.title, m.data.refType, m.data.refId])).toEqual([
      ['priority', 'Head count: Bus A', 'headcount', hc],
    ]);
    expect(minjis[0]?.platform).toBe('android');
    const kims = await FixturePushPort.all(mailbox(), 'apns-kim-0001');
    expect(kims[0]?.apnsEnvironment).toBe('sandbox');

    // The count closes with Minji missing: the incident's push to Sora answers invalid, so her
    // device is forgotten.
    await putHeadcount({
      openedAtDevice: '06:50',
      closedAtDevice: '06:58',
      groupName: 'Bus A',
      marks: [{ participationId: byName('Juho Kim'), mark: 'present' }],
    });
    expect(await devicesWithToken('dead-sora-0001')).toBe(0);

    // Quiet hours around now hold a normal-lane announcement; a run after they end sends it.
    const { time } = localClock(new Date().toISOString(), trip.timezone);
    const [h = 0] = time.split(':').map(Number);
    const hh = (n: number) => `${String(((n % 24) + 24) % 24).padStart(2, '0')}:00`;
    await api(nate).patch(`/v1/orgs/${org.id}`, {
      settings: { quietHours: { from: hh(h - 1), to: hh(h + 2) } },
    });
    const later = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
    const announce = (title: string) =>
      api(nate).post(`${base}/announcements`, {
        title,
        body: 'See you at breakfast.',
        requiresAck: false,
        sharedWithGuardians: false,
      });
    // Without keys: the held rows are marked unconfigured, nothing reaches the fixture.
    await announce('Lights out at 22:30');
    expect((await FixturePushPort.all(mailbox(), 'fcm-minji-0001')).length).toBe(1);
    const bare = await runPushes(env, later(3), {
      orgId: org.id,
      port: new UnconfiguredPushPort(),
    });
    expect(bare.unconfigured).toBeGreaterThanOrEqual(1);
    expect((await FixturePushPort.all(mailbox(), 'fcm-minji-0001')).length).toBe(1);
    // With the fixture port: the next held row goes out after quiet hours.
    await announce('Breakfast at 07:00');
    const held = await runPushes(env, later(3), { orgId: org.id });
    expect(held.sent).toBeGreaterThanOrEqual(1);
    const after = await FixturePushPort.all(mailbox(), 'fcm-minji-0001');
    expect(after.at(-1)?.title).toBe('Breakfast at 07:00');
    expect(after.at(-1)?.lane).toBe('normal');
    // A row more than six hours late is marked stale and not sent.
    await announce('Pool closes at 21:00');
    const stale = await runPushes(env, later(10), { orgId: org.id });
    expect(stale.stale).toBeGreaterThanOrEqual(1);
    expect((await FixturePushPort.all(mailbox(), 'fcm-minji-0001')).at(-1)?.title).toBe(
      'Breakfast at 07:00',
    );
    // A second run finds nothing left.
    expect((await runPushes(env, later(10), { orgId: org.id })).rows).toBe(0);

    // Logout removes Minji's device.
    expect((await api(minji).post('/v1/auth/logout')).status).toBe(200);
    expect(await devicesWithToken('fcm-minji-0001')).toBe(0);
  });
});
