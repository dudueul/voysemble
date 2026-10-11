// Copyright 2026- At Day. All rights reserved.
// Facts: a leader syncs an open session (unmarked rows are missing), then a closed one; closing is
// final and replays are ignored; scope is the group's travelers; unknown participation ids are
// dropped; travelers and guardians cannot sync or list; organizer can; another trip's id is 409.

import type {
  HeadcountList,
  IssueInvitesResponse,
  RosterImportResponse,
  SyncHeadcountResponse,
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
  const kim = await signIn('kim@example.com');
  await api(kim).post('/v1/invites/redeem', { code: codeFor('Kim') });
  const minji = await signIn('minji@example.com');
  await api(minji).post('/v1/invites/redeem', { code: codeFor('Minji Park') });
  const byName = (name: string) =>
    imported.participations.find((p) => p.displayName === name)?.id ?? '';
  return {
    nate,
    kim,
    minji,
    org,
    trip,
    base: `/v1/orgs/${org.id}/trips/${trip.id}/headcounts`,
    byName,
  };
}

describe('head counts', () => {
  it('leader syncs open then closed; close is final; replay ignored', async () => {
    const { kim, nate, base, byName } = await setupTrip();
    const id = crypto.randomUUID();
    const { SELF } = await import('cloudflare:test');
    const call = (who: typeof kim, body: unknown) =>
      SELF.fetch(`https://example.com${base}/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${who.token}` },
        body: JSON.stringify(body),
      });

    const r1 = await call(kim, {
      openedAtDevice: '06:50',
      closedAtDevice: null,
      groupName: 'Bus A',
      marks: [{ participationId: byName('Minji Park'), mark: 'present' }],
    });
    expect(r1.status).toBe(200);
    const s1 = await json<SyncHeadcountResponse>(r1);
    expect(s1.applied).toBe(true);
    expect(s1.session.openedByName).toBe('Kim');
    expect(s1.session.expected).toBe(2); // Bus A travelers: Minji, Juho
    expect(s1.session.present).toBe(1);
    expect(s1.session.missing.map((m) => m.displayName)).toEqual(['Juho Kim']);
    expect(s1.session.closedWithMissing).toBe(false);

    const r2 = await call(kim, {
      openedAtDevice: '06:50',
      closedAtDevice: '06:58',
      groupName: 'Bus A',
      marks: [
        { participationId: byName('Minji Park'), mark: 'present' },
        { participationId: byName('Juho Kim'), mark: 'excused' },
        { participationId: crypto.randomUUID(), mark: 'present' },
      ],
    });
    const s2 = await json<SyncHeadcountResponse>(r2);
    expect(s2.applied).toBe(true);
    expect(s2.session.closedAtDevice).toBe('06:58');
    expect(s2.session.accounted).toBe(2);
    expect(s2.session.missing).toEqual([]);
    expect(s2.session.closedWithMissing).toBe(false);

    const r3 = await call(kim, {
      openedAtDevice: '06:50',
      closedAtDevice: '07:30',
      groupName: 'Bus A',
      marks: [],
    });
    const s3 = await json<SyncHeadcountResponse>(r3);
    expect(s3.applied).toBe(false);
    expect(s3.session.closedAtDevice).toBe('06:58');
    expect(s3.session.accounted).toBe(2);

    const list = await json<HeadcountList>(await api(nate).get(base));
    expect(list.headcounts).toHaveLength(1);
    expect(list.headcounts[0]?.id).toBe(id);
  });

  it('closing with unmarked travelers reports them missing; whole-trip scope; roles enforced', async () => {
    const { kim, nate, minji, base, org } = await setupTrip();
    const { SELF } = await import('cloudflare:test');
    const id = crypto.randomUUID();
    const put = (token: string, body: unknown, hid = id) =>
      SELF.fetch(`https://example.com${base}/${hid}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    const closed = await json<SyncHeadcountResponse>(
      await put(nate.token, {
        openedAtDevice: '06:50',
        closedAtDevice: '06:55',
        groupName: null,
        marks: [],
      }),
    );
    expect(closed.session.openedByName).toBe('Organizer');
    expect(closed.session.expected).toBe(3);
    expect(closed.session.missing.map((m) => m.displayName).sort()).toEqual([
      'Juho Kim',
      'Lee, Hana',
      'Minji Park',
    ]);
    expect(closed.session.closedWithMissing).toBe(true);

    expect(
      (
        await put(
          minji.token,
          { openedAtDevice: '06:50', closedAtDevice: null, groupName: null, marks: [] },
          crypto.randomUUID(),
        )
      ).status,
    ).toBe(403);
    expect((await api(minji).get(base)).status).toBe(403);
    expect((await api(kim).get(base)).status).toBe(200);

    // Same id on another trip of the same org: 409.
    const other = await createTrip(nate, org.id);
    const clash = await SELF.fetch(
      `https://example.com/v1/orgs/${org.id}/trips/${other.id}/headcounts/${id}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${nate.token}` },
        body: JSON.stringify({
          openedAtDevice: '07:00',
          closedAtDevice: null,
          groupName: null,
          marks: [],
        }),
      },
    );
    expect(clash.status).toBe(409);
  });
});
