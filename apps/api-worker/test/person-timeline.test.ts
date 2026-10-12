// Copyright 2026- At Day. All rights reserved.
// Facts (D17): staff read a person's card; travelers and guardians cannot; a traveler's timeline
// carries the join, acknowledgments with titles, head counts with their mark, the incident, the
// leader's confirmation is on the leader's timeline, the guardian message on the traveler's;
// guardian links carry invite status; entries are newest first.

import type {
  Announcement,
  IssueInvitesResponse,
  PersonTimeline,
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
  const kimRow = await json<{ id: string }>(
    await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/leaders`, {
      displayName: 'Kim',
      groupName: 'Bus A',
    }),
  );
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
  const timeline = async (who: Client, id: string) => api(who).get(`${base}/people/${id}/timeline`);
  return { nate, kim, minji, sora, base, byName, kimId: kimRow.id, sync, timeline };
}

describe('person timeline (slice 026)', () => {
  it('staff only; a traveler card carries the join, acks, head counts, incident and message; links', async () => {
    const { nate, kim, minji, sora, base, byName, kimId, sync, timeline } = await setupTrip();
    const minjiId = byName('Minji Park');
    expect((await timeline(minji, minjiId)).status).toBe(403);
    expect((await timeline(sora, minjiId)).status).toBe(403);
    expect((await timeline(nate, crypto.randomUUID())).status).toBe(404);

    const a = await json<Announcement>(
      await api(nate).post(`${base}/announcements`, {
        title: 'Bus leaves 07:15',
        body: 'Lobby.',
        requiresAck: true,
        sharedWithGuardians: false,
      }),
    );
    expect(
      (
        await api(minji).post(`${base}/announcements/${a.id}/ack`, {
          ackedAtDevice: '2026-12-31T06:30:00.000Z',
        })
      ).status,
    ).toBe(200);
    const id = crypto.randomUUID();
    const closed = await json<SyncHeadcountResponse>(
      await sync(kim, id, {
        openedAtDevice: '06:50',
        closedAtDevice: '06:55',
        groupName: 'Bus A',
        marks: [
          { participationId: minjiId, mark: 'missing' },
          { participationId: byName('Juho Kim'), mark: 'present' },
        ],
      }),
    );
    expect(closed.incidentId).toBeTruthy();
    expect(
      (
        await api(kim).post(`${base}/incidents/${closed.incidentId}/confirm`, {
          status: 'with_group',
          note: 'At the kiosk.',
        })
      ).status,
    ).toBe(200);
    expect(
      (await api(nate).post(`${base}/incidents/${closed.incidentId}/guardian-message`)).status,
    ).toBe(200);
    expect(
      (
        await api(nate).post(`${base}/incidents/${closed.incidentId}/resolve`, {
          note: 'Back on the bus.',
        })
      ).status,
    ).toBe(200);

    const card = await json<PersonTimeline>(await timeline(nate, minjiId));
    expect(card.participation).toMatchObject({
      id: minjiId,
      displayName: 'Minji Park',
      role: 'traveler',
      invite: 'joined',
    });
    expect(card.participation.lastAckAt).toBeTruthy();
    expect(card.guardianOf).toBeNull();
    expect(card.guardians).toEqual([
      { participationId: byName('Sora Park'), displayName: 'Sora Park', invite: 'joined' },
    ]);
    const kinds = card.entries.map((e) => e.kind);
    expect(kinds).toContain('joined');
    expect(kinds).toContain('ack');
    expect(kinds).toContain('headcount');
    expect(kinds).toContain('incident');
    expect(kinds).toContain('guardian_message');
    expect(kinds).not.toContain('confirmation');
    expect(card.entries.find((e) => e.kind === 'ack')?.title).toBe(
      'Acknowledged: Bus leaves 07:15',
    );
    expect(card.entries.find((e) => e.kind === 'headcount')?.title).toBe(
      'Head count · Bus A · missing',
    );
    expect(card.entries.filter((e) => e.kind === 'incident').map((e) => e.title)).toEqual(
      expect.arrayContaining(['Incident resolved']),
    );
    expect(card.entries.find((e) => e.kind === 'guardian_message')?.detail).toMatch(
      /Minji Park is with the group/,
    );
    // Newest first.
    const times = card.entries.map((e) => e.at);
    expect([...times].sort().reverse()).toEqual(times);

    // The leader's card: the head count they opened and their confirmation; readable by the leader.
    const kimCard = await json<PersonTimeline>(await timeline(kim, kimId));
    expect(kimCard.participation.role).toBe('leader');
    expect(kimCard.entries.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['joined', 'headcount', 'confirmation']),
    );
    expect(kimCard.entries.find((e) => e.kind === 'confirmation')?.title).toMatch(
      /^Confirmed with group: /,
    );
    expect(kimCard.entries.find((e) => e.kind === 'headcount')?.title).toBe(
      'Opened head count · Bus A',
    );

    // The guardian's card links the traveler; no entries beyond the join.
    const soraCard = await json<PersonTimeline>(await timeline(nate, byName('Sora Park')));
    expect(soraCard.guardianOf).toEqual({
      participationId: minjiId,
      displayName: 'Minji Park',
      invite: 'joined',
    });
    expect(soraCard.entries.map((e) => e.kind)).toEqual(['joined']);
  });
});
