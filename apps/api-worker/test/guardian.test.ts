// Copyright 2026- At Day. All rights reserved.
// Facts (D13): only the guardian of a traveler reads the status; before any count the traveler
// is not counted; an open count with a present mark reads present with the leader's name and
// device clock; a close with the traveler missing reads missing and opens the incident; the
// organizer's guardian message appears on the status; no coordinates and no other names. Slice
// 080: the incident carries its kind, so a traveler's own help request reads as such.

import type {
  GuardianStatus,
  IssueInvitesResponse,
  RosterImportResponse,
  SyncHeadcountResponse,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { api, type Client, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

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
  const redeem = async (email: string, name: string) => {
    const c = await signIn(email);
    expect((await api(c).post('/v1/invites/redeem', { code: codeFor(name) })).status).toBe(200);
    return c;
  };
  const kim = await redeem('kim@example.com', 'Kim');
  const minji = await redeem('minji@example.com', 'Minji Park');
  const sora = await redeem('sora@example.com', 'Sora Park');
  const byName = (name: string) =>
    imported.participations.find((p) => p.displayName === name)?.id ?? '';
  const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
  const { SELF } = await import('cloudflare:test');
  const sync = (who: Client, id: string, body: unknown) =>
    SELF.fetch(`https://example.com${base}/headcounts/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${who.token}` },
      body: JSON.stringify(body),
    });
  const status = async () => json<GuardianStatus>(await api(sora).get(`${base}/guardian/status`));
  return { nate, kim, minji, sora, base, byName, sync, status };
}

describe('guardian status (slice 025)', () => {
  it('only the guardian reads it; not counted before any count; no coordinates or other names', async () => {
    const { nate, kim, minji, base, status, byName } = await setupTrip();
    expect((await api(minji).get(`${base}/guardian/status`)).status).toBe(403);
    expect((await api(kim).get(`${base}/guardian/status`)).status).toBe(403);
    expect((await api(nate).get(`${base}/guardian/status`)).status).toBe(403);
    const s = await status();
    expect(s.traveler).toEqual({
      participationId: byName('Minji Park'),
      displayName: 'Minji Park',
      groupName: 'Bus A',
    });
    expect(s.count).toEqual({
      status: 'not_counted',
      headcountId: null,
      groupLabel: null,
      closed: false,
      atDevice: null,
      byName: null,
      receivedAt: null,
    });
    expect(s.incident).toBeNull();
    expect(s.itineraryRevision).toBe(0);
    expect(JSON.stringify(s)).not.toMatch(/Juho|Hana|lat|lng|latitude/);
  });

  it('present on an open count, missing at close with the incident, then the guardian message', async () => {
    const { nate, kim, minji, base, byName, sync, status } = await setupTrip();
    const id = crypto.randomUUID();
    const open = await sync(kim, id, {
      openedAtDevice: '06:50',
      closedAtDevice: null,
      groupName: 'Bus A',
      marks: [{ participationId: byName('Minji Park'), mark: 'present' }],
    });
    expect(open.status).toBe(200);
    const s1 = await status();
    expect(s1.count).toMatchObject({
      status: 'present',
      headcountId: id,
      groupLabel: 'Bus A',
      closed: false,
      atDevice: '06:50',
      byName: 'Kim',
    });
    expect(s1.count.receivedAt).toMatch(/^\d{4}-/);

    const closed = await json<SyncHeadcountResponse>(
      await sync(kim, id, {
        openedAtDevice: '06:50',
        closedAtDevice: '06:55',
        groupName: 'Bus A',
        marks: [
          { participationId: byName('Minji Park'), mark: 'missing' },
          { participationId: byName('Juho Kim'), mark: 'present' },
        ],
      }),
    );
    expect(closed.incidentId).toBeTruthy();
    const s2 = await status();
    expect(s2.count).toMatchObject({ status: 'missing', closed: true, atDevice: '06:55' });
    expect(s2.incident).toMatchObject({
      id: closed.incidentId,
      status: 'open',
      kind: 'headcount_missing',
      message: null,
    });

    expect(
      (
        await api(kim).post(`${base}/incidents/${closed.incidentId}/confirm`, {
          status: 'with_group',
          note: 'Found her at the kiosk.',
        })
      ).status,
    ).toBe(200);
    expect(
      (await api(nate).post(`${base}/incidents/${closed.incidentId}/guardian-message`)).status,
    ).toBe(200);
    const s3 = await status();
    expect(s3.incident?.message?.bodyEn).toMatch(
      /^Minji Park is with the group\. Found her at the kiosk\. Confirmed by leader Kim at \d{2}:\d{2}\.$/,
    );
    expect(s3.incident?.message?.bodyKo).toContain('Minji Park');
    expect(s3.incident?.message?.sentByName).toBeTruthy();
    // Slice 080: once resolved, Minji's own help request is the latest incident, kind help, no
    // message yet; her words stay with her and the organizer.
    expect(
      (await api(nate).post(`${base}/incidents/${closed.incidentId}/resolve`, { note: null }))
        .status,
    ).toBe(200);
    expect(
      (
        await api(minji).post(`${base}/incidents`, {
          title: 'I feel sick',
          participationIds: [byName('Minji Park')],
        })
      ).status,
    ).toBe(201);
    const s4 = await status();
    expect(s4.incident).toMatchObject({ status: 'open', kind: 'help', message: null });
    expect(JSON.stringify(s4)).not.toContain('I feel sick');
  });
});
