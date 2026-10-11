// Copyright 2026- At Day. All rights reserved.
// Facts: creator becomes owner; organizations are isolated (cross-org denial is 403 with no
// existence leak); trip creation needs organizer or owner; listing needs membership.

import { ErrorEnvelope, OrganizationList, TripList } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { api, createOrg, createTrip, json, signIn } from './helpers';

describe('organizations and trips', () => {
  it('creator is owner and sees the org in /v1/orgs and /v1/me', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    expect(org.role).toBe('owner');
    const list = OrganizationList.parse(await json(await api(nate).get('/v1/orgs')));
    expect(list.organizations.map((o) => o.id)).toEqual([org.id]);
    const me = await json<{ memberships: { organizationId: string; role: string }[] }>(
      await api(nate).get('/v1/me'),
    );
    expect(me.memberships).toEqual([
      { organizationId: org.id, organizationName: 'Seoul Arts High', role: 'owner' },
    ]);
  });

  it('owner creates and lists trips; dates and zone are validated', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    const trip = await createTrip(nate, org.id);
    expect(trip.organizationId).toBe(org.id);
    const list = TripList.parse(await json(await api(nate).get(`/v1/orgs/${org.id}/trips`)));
    expect(list.trips).toHaveLength(1);
    const bad = await api(nate).post(`/v1/orgs/${org.id}/trips`, {
      name: 'x',
      startsOn: '2026-12-26',
      endsOn: '2026-12-01',
      timezone: 'Asia/Seoul',
    });
    expect(bad.status).toBe(400);
    const badZone = await api(nate).post(`/v1/orgs/${org.id}/trips`, {
      name: 'x',
      startsOn: '2026-12-26',
      endsOn: '2026-12-27',
      timezone: 'Mars/Olympus',
    });
    expect(badZone.status).toBe(400);
  });

  it('cross-org: a different account gets 403 for list and create, same shape as unknown org', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    await createTrip(nate, org.id);
    const other = await signIn('other@example.com');
    await createOrg(other, 'Busan Choir');
    const denied = await api(other).get(`/v1/orgs/${org.id}/trips`);
    expect(denied.status).toBe(403);
    expect(ErrorEnvelope.parse(await denied.json()).error.code).toBe('FORBIDDEN');
    const deniedCreate = await api(other).post(`/v1/orgs/${org.id}/trips`, {
      name: 'intruder',
      startsOn: '2026-12-26',
      endsOn: '2026-12-27',
    });
    expect(deniedCreate.status).toBe(403);
    const unknown = await api(other).get(`/v1/orgs/${crypto.randomUUID()}/trips`);
    expect(unknown.status).toBe(403);
  });

  it('anonymous callers get 401 on every org route', async () => {
    const anon = api(null);
    expect((await anon.get('/v1/orgs')).status).toBe(401);
    expect((await anon.post('/v1/orgs', { name: 'x' })).status).toBe(401);
    expect((await anon.get(`/v1/orgs/${crypto.randomUUID()}/trips`)).status).toBe(401);
  });
});
