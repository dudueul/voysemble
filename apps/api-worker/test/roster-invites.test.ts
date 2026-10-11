// Copyright 2026- At Day. All rights reserved.
// Facts: CSV import creates traveler + bound guardian participations; invites are per row,
// single-use, role-fixed; redeem joins org + trip and binds the row; an invite never grants
// organizer; leaders can read the roster, members cannot.

import {
  type IssueInvitesResponse,
  type RedeemInviteResponse,
  type RosterImportResponse,
  RosterResponse,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
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
