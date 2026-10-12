// Copyright 2026- At Day. All rights reserved.
// Facts: CSV import creates traveler + bound guardian participations; invites are per row,
// single-use, role-fixed; redeem joins org + trip and binds the row; an invite never grants
// organizer; leaders can read the roster, members cannot.

import {
  type Announcement,
  type IssueInvitesResponse,
  type RedeemInviteResponse,
  type RosterImportResponse,
  RosterResponse,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { inviteStatusOf } from '../src/routes/roster';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

async function setup() {
  const nate = await signIn('nate@example.com');
  const org = await createOrg(nate);
  const trip = await createTrip(nate, org.id);
  const imported = await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/import`, {
    csv: SAMPLE_CSV,
  });
  expect(imported.status).toBe(201);
  const body = await json<RosterImportResponse>(imported);
  return { nate, org, trip, body };
}

describe('roster import', () => {
  it('creates travelers and guardians bound to them; quoted names survive', async () => {
    const { body } = await setup();
    expect(body.created).toBe(5);
    expect(body.skipped).toEqual([]);
    const travelers = body.participations.filter((p) => p.role === 'traveler');
    const guardians = body.participations.filter((p) => p.role === 'guardian');
    expect(travelers.map((t) => t.displayName).sort()).toEqual([
      'Juho Kim',
      'Lee, Hana',
      'Minji Park',
    ]);
    expect(guardians).toHaveLength(2);
    const minji = travelers.find((t) => t.displayName === 'Minji Park');
    const sora = guardians.find((g) => g.displayName === 'Sora Park');
    expect(sora?.guardianOf).toBe(minji?.id);
    expect(sora?.groupName).toBe('Bus A');
    // guardian_contact is not persisted anywhere in the response.
    expect(JSON.stringify(body)).not.toContain('sora@example.com');
  });

  it('rejects CSV without a name column and reports empty-name rows', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    const trip = await createTrip(nate, org.id);
    const noName = await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/import`, {
      csv: 'group\nBus A',
    });
    expect(noName.status).toBe(400);
    const blank = await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/import`, {
      csv: 'name,group\n,Bus A\nOk Person,Bus A',
    });
    expect(blank.status).toBe(201);
    const body = await json<RosterImportResponse>(blank);
    expect(body.created).toBe(1);
    expect(body.skipped).toEqual([{ line: 2, reason: 'name is empty' }]);
  });

  it('unknown trip is 404 for a member of the org', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    const res = await api(nate).post(
      `/v1/orgs/${org.id}/trips/${crypto.randomUUID()}/roster/import`,
      {
        csv: SAMPLE_CSV,
      },
    );
    expect(res.status).toBe(404);
  });
});

describe('invites', () => {
  it('issues one code per unbound participation, once; codes are not re-issued while live', async () => {
    const { nate, org, trip } = await setup();
    const first = await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/invites`);
    expect(first.status).toBe(201);
    const issued = await json<IssueInvitesResponse>(first);
    expect(issued.invites).toHaveLength(5);
    for (const inv of issued.invites) expect(inv.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const again = await json<IssueInvitesResponse>(
      await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/invites`),
    );
    expect(again.invites).toHaveLength(0);
  });

  it('redeem joins org + trip as member, binds the row, and is single-use', async () => {
    const { nate, org, trip, body } = await setup();
    const issued = await json<IssueInvitesResponse>(
      await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/invites`),
    );
    const minji = body.participations.find((p) => p.displayName === 'Minji Park');
    const code = issued.invites.find((i) => i.participationId === minji?.id)?.code ?? '';

    const traveler = await signIn('minji@example.com');
    // Lower-case, no dash: normalization accepts it.
    const redeemed = await api(traveler).post('/v1/invites/redeem', {
      code: code.toLowerCase().replace('-', ''),
    });
    expect(redeemed.status).toBe(200);
    const r = await json<RedeemInviteResponse>(redeemed);
    expect(r.organizationId).toBe(org.id);
    expect(r.tripId).toBe(trip.id);
    expect(r.participation.accountId).toBe(traveler.accountId);
    expect(r.participation.role).toBe('traveler');

    const me = await json<{ memberships: { organizationId: string; role: string }[] }>(
      await api(traveler).get('/v1/me'),
    );
    expect(me.memberships).toEqual([
      { organizationId: org.id, organizationName: 'Seoul Arts High', role: 'member' },
    ]);
    // Member can list trips but not the roster, and cannot create trips.
    expect((await api(traveler).get(`/v1/orgs/${org.id}/trips`)).status).toBe(200);
    expect((await api(traveler).get(`/v1/orgs/${org.id}/trips/${trip.id}/roster`)).status).toBe(
      403,
    );
    expect(
      (
        await api(traveler).post(`/v1/orgs/${org.id}/trips`, {
          name: 'x',
          startsOn: '2026-12-26',
          endsOn: '2026-12-27',
        })
      ).status,
    ).toBe(403);

    // Second use by someone else: 409.
    const other = await signIn('other@example.com');
    const second = await api(other).post('/v1/invites/redeem', { code });
    expect(second.status).toBe(409);
    // Unknown code: 404.
    expect((await api(other).post('/v1/invites/redeem', { code: 'ZZZZ-ZZZZ' })).status).toBe(404);
    // Issuing again now skips the bound row.
    const again = await json<IssueInvitesResponse>(
      await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/invites`),
    );
    expect(again.invites.map((i) => i.participationId)).not.toContain(minji?.id);
  });

  it('a leader invite grants leader org role, roster read, and never organizer', async () => {
    const { nate, org, trip } = await setup();
    // Leaders are not CSV rows; this slice exposes no leader endpoint yet, so add one through
    // the Durable Object directly (same code path redeem uses).
    const { orgObject } = await import('../src/org/client');
    const { env } = await import('cloudflare:test');
    const kim = await (await orgObject(env, org.id)).addLeader(trip.id, 'Kim', 'Bus A');
    const issued = await json<IssueInvitesResponse>(
      await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/invites`),
    );
    const code = issued.invites.find((i) => i.participationId === kim.id)?.code ?? '';
    expect(issued.invites.find((i) => i.participationId === kim.id)?.role).toBe('leader');

    const leader = await signIn('kim@example.com');
    expect((await api(leader).post('/v1/invites/redeem', { code })).status).toBe(200);
    const me = await json<{ memberships: { role: string }[] }>(await api(leader).get('/v1/me'));
    expect(me.memberships[0]?.role).toBe('leader');
    const roster = RosterResponse.parse(
      await json(await api(leader).get(`/v1/orgs/${org.id}/trips/${trip.id}/roster`)),
    );
    expect(roster.participations).toHaveLength(6);
    expect(
      (
        await api(leader).post(`/v1/orgs/${org.id}/trips`, {
          name: 'x',
          startsOn: '2026-12-26',
          endsOn: '2026-12-27',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api(leader).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/import`, {
          csv: SAMPLE_CSV,
        })
      ).status,
    ).toBe(403);
  });
});

describe('leaders and dev mailbox', () => {
  it('organizer adds a leader by name; member cannot', async () => {
    const { nate, org, trip } = await setup();
    const res = await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/leaders`, {
      displayName: 'Kim',
      groupName: 'Bus A',
    });
    expect(res.status).toBe(201);
    const kim = await json<{ role: string; groupName: string | null }>(res);
    expect(kim.role).toBe('leader');
    expect(kim.groupName).toBe('Bus A');
    const other = await signIn('other@example.com');
    const denied = await api(other).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/leaders`, {
      displayName: 'Intruder',
    });
    expect(denied.status).toBe(403);
  });

  it('dev mailbox returns the newest fixture mail in local env', async () => {
    await signIn('mailbox@example.com');
    const res = await api(null).get('/v1/dev/mailbox?to=mailbox@example.com');
    expect(res.status).toBe(200);
    const mail = await json<{ tag: string; text: string }>(res);
    expect(mail.tag).toBe('magic-link');
    expect(mail.text).toContain('#token=');
    expect((await api(null).get('/v1/dev/mailbox?to=nobody@example.com')).status).toBe(404);
  });
});

describe('GET /v1/me/participations', () => {
  it('lists the trips a redeemed account participates in, empty for the organizer', async () => {
    const { nate, org, trip, body } = await setup();
    const issued = await json<IssueInvitesResponse>(
      await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/invites`),
    );
    const minji = body.participations.find((p) => p.displayName === 'Minji Park');
    const code = issued.invites.find((i) => i.participationId === minji?.id)?.code ?? '';
    const traveler = await signIn('minji@example.com');
    await api(traveler).post('/v1/invites/redeem', { code });
    const mine = await json<{
      participations: {
        tripId: string;
        tripName: string;
        organizationName: string;
        participation: { role: string };
      }[];
    }>(await api(traveler).get('/v1/me/participations'));
    // Storage persists across tests in this file (same account, several orgs): scope to this org.
    const here = mine.participations.filter((p) => p.tripId === trip.id);
    expect(here).toHaveLength(1);
    expect(here[0]?.tripName).toBe('Korea Concert Tour');
    expect(here[0]?.organizationName).toBe('Seoul Arts High');
    expect(here[0]?.participation.role).toBe('traveler');
    const none = await json<{ participations: unknown[] }>(
      await api(nate).get('/v1/me/participations'),
    );
    expect(none.participations).toEqual([]);
    expect((await api(null).get('/v1/me/participations')).status).toBe(401);
  });
});

describe('roster entries for the People page (slice 023)', () => {
  it('carry invite status none -> issued -> joined and the latest ack time', async () => {
    const { nate, org, trip, body } = await setup();
    const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
    const before = RosterResponse.parse(await json(await api(nate).get(`${base}/roster`)));
    expect(before.participations).toHaveLength(5);
    expect(before.participations.map((p) => p.invite)).toEqual([
      'none',
      'none',
      'none',
      'none',
      'none',
    ]);
    expect(before.participations.every((p) => p.lastAckAt === null)).toBe(true);

    const issued = await json<IssueInvitesResponse>(await api(nate).post(`${base}/invites`));
    const after = RosterResponse.parse(await json(await api(nate).get(`${base}/roster`)));
    expect(after.participations.every((p) => p.invite === 'issued')).toBe(true);

    const minji = body.participations.find((p) => p.displayName === 'Minji Park');
    const code = issued.invites.find((i) => i.participationId === minji?.id)?.code ?? '';
    const traveler = await signIn('minji-people@example.com');
    expect((await api(traveler).post('/v1/invites/redeem', { code })).status).toBe(200);
    const a = await json<Announcement>(
      await api(nate).post(`${base}/announcements`, {
        title: 'Bus',
        body: 'Lobby 07:15.',
        requiresAck: true,
        sharedWithGuardians: false,
      }),
    );
    expect(
      (
        await api(traveler).post(`${base}/announcements/${a.id}/ack`, {
          ackedAtDevice: '2026-12-31T06:30:00.000Z',
        })
      ).status,
    ).toBe(200);

    const joined = RosterResponse.parse(await json(await api(nate).get(`${base}/roster`)));
    const row = joined.participations.find((p) => p.id === minji?.id);
    expect(row?.invite).toBe('joined');
    expect(row?.accountId).toBe(traveler.accountId);
    expect(row?.lastAckAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Everyone else is still waiting on their code and has never acknowledged.
    for (const p of joined.participations.filter((p) => p.id !== minji?.id)) {
      expect(p.invite).toBe('issued');
      expect(p.lastAckAt).toBeNull();
    }
  });

  it('inviteStatusOf: a live code wins over expired ones; redeemed and revoked codes do not count', () => {
    const now = '2026-10-12T00:00:00.000Z';
    const live = { expiresAt: '2026-11-11T00:00:00.000Z', redeemedAt: null, revokedAt: null };
    const old = { expiresAt: '2026-09-01T00:00:00.000Z', redeemedAt: null, revokedAt: null };
    const revoked = { ...live, revokedAt: '2026-10-01T00:00:00.000Z' };
    const redeemed = { ...live, redeemedAt: '2026-10-01T00:00:00.000Z' };
    expect(inviteStatusOf('acct', [], now)).toBe('joined');
    expect(inviteStatusOf(null, [], now)).toBe('none');
    expect(inviteStatusOf(null, [old, live], now)).toBe('issued');
    expect(inviteStatusOf(null, [old], now)).toBe('expired');
    expect(inviteStatusOf(null, [revoked, redeemed], now)).toBe('none');
  });
});

describe('roster editing and invite revocation (slice 028)', () => {
  it('edits a row, revokes a code so a new one can be issued, removes unjoined rows with their guardians', async () => {
    const { nate, org, trip, body } = await setup();
    const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
    const id = (name: string) => body.participations.find((p) => p.displayName === name)?.id ?? '';
    const juho = id('Juho Kim');
    // Edit: name and group; role and binding untouched; unknown ids 404.
    const edited = await json<{ displayName: string; groupName: string | null; role: string }>(
      await api(nate).patch(`${base}/roster/${juho}`, {
        displayName: 'Kim Juho',
        groupName: 'Bus B',
      }),
    );
    expect(edited).toMatchObject({ displayName: 'Kim Juho', groupName: 'Bus B', role: 'traveler' });
    expect(
      (await api(nate).patch(`${base}/roster/${crypto.randomUUID()}`, { groupName: null })).status,
    ).toBe(404);

    // Revoke: the live code dies, status drops to none, a fresh issue mints a new code, the old one cannot redeem.
    const issued = await json<IssueInvitesResponse>(await api(nate).post(`${base}/invites`));
    const oldCode = issued.invites.find((i) => i.participationId === juho)?.code ?? '';
    const revoked = await json<{ revoked: number }>(
      await api(nate).post(`${base}/roster/${juho}/revoke-invite`),
    );
    expect(revoked.revoked).toBe(1);
    const roster = RosterResponse.parse(await json(await api(nate).get(`${base}/roster`)));
    expect(roster.participations.find((p) => p.id === juho)?.invite).toBe('none');
    const reissued = await json<IssueInvitesResponse>(await api(nate).post(`${base}/invites`));
    expect(reissued.invites.map((i) => i.participationId)).toEqual([juho]);
    const stranger = await signIn('stranger@example.com');
    expect((await api(stranger).post('/v1/invites/redeem', { code: oldCode })).status).toBe(404);
    expect(
      (await api(stranger).post('/v1/invites/redeem', { code: reissued.invites[0]?.code ?? '' }))
        .status,
    ).toBe(200);
    // Joined now: revoking the code is refused; so is removing the row.
    expect((await api(nate).post(`${base}/roster/${juho}/revoke-invite`)).status).toBe(409);
    expect((await api(nate).delete(`${base}/roster/${juho}`)).status).toBe(409);

    // Remove: a traveler nobody joined goes with the guardian bound to them; their codes are revoked.
    const hana = id('Lee, Hana');
    const hanaMom = id('Hana Mom');
    const removed = await json<{ removed: string[] }>(
      await api(nate).delete(`${base}/roster/${hana}`),
    );
    expect(removed.removed.sort()).toEqual([hana, hanaMom].sort());
    const after = RosterResponse.parse(await json(await api(nate).get(`${base}/roster`)));
    expect(after.participations.map((p) => p.displayName).sort()).toEqual([
      'Kim Juho',
      'Minji Park',
      'Sora Park',
    ]);
    const hanaCode = issued.invites.find((i) => i.participationId === hana)?.code ?? '';
    expect((await api(stranger).post('/v1/invites/redeem', { code: hanaCode })).status).toBe(404);
    expect((await api(nate).delete(`${base}/roster/${hana}`)).status).toBe(404);
    // A member (the stranger joined as a traveler) cannot edit or remove.
    const minjiId = id('Minji Park');
    expect(
      (await api(stranger).patch(`${base}/roster/${minjiId}`, { groupName: 'Bus B' })).status,
    ).toBe(403);
    expect((await api(stranger).delete(`${base}/roster/${minjiId}`)).status).toBe(403);
  });
});
