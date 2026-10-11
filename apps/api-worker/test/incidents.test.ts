// Copyright 2026- At Day. All rights reserved.
// Facts: a head count closed with missing travelers opens exactly one incident naming them (a
// replay of the closed session returns the same id); a clean close opens none; the list puts
// open cards first; staff resolve with a note (second resolve 409, unknown id 404); travelers
// get 403 on list and resolve.

import type {
  Incident,
  IncidentList,
  IssueInvitesResponse,
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
});
