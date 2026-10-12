// Copyright 2026- At Day. All rights reserved.
// Facts (D27): a bound guardian writes the note and the organizer may too; a leader, a stranger
// traveler and a guardian of someone else cannot write; the roster flags the row without the
// content; the organizer, the traveler's own group leader, the traveler and the bound guardian
// reveal it, each reveal lands on the timeline; the other group's leader, another traveler and
// another guardian are 403; a blank note clears the row and the next reveal is 404 while the
// audit count stays; a non-traveler row is 404.

import type {
  CareNoteStatus,
  PersonTimeline,
  RevealCareNoteResponse,
  RosterResponse,
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
    hanaMom: await redeem('hm@example.com', 'Hana Mom'),
    base,
    minjiId: invite('Minji Park')?.participationId ?? '',
    kimId: invite('Kim')?.participationId ?? '',
  };
}

const NOTE = {
  allergies: 'Peanuts',
  medications: 'EpiPen in the red bag',
  freeText: 'Asks for it herself.',
};

describe('care notes (slice 030)', () => {
  it('write by guardian or organizer, flag on the roster, audited reveals by the right people', async () => {
    const t = await setupTrip();
    const path = `${t.base}/people/${t.minjiId}/care-note`;

    // Nothing on file yet: status is honest, a reveal is 404, outsiders are 403.
    expect(await json<CareNoteStatus>(await api(t.sora).get(path))).toMatchObject({
      hasCareNote: false,
      updatedByName: null,
      reveals: 0,
    });
    expect((await api(t.juho).get(path)).status).toBe(403);
    expect((await api(t.kim).post(`${path}/reveal`)).status).toBe(404);

    // Writes: the bound guardian yes; a leader, another traveler, another guardian no.
    expect((await api(t.kim).put(path, NOTE)).status).toBe(403);
    expect((await api(t.juho).put(path, NOTE)).status).toBe(403);
    expect((await api(t.hanaMom).put(path, NOTE)).status).toBe(403);
    const written = await json<CareNoteStatus>(await api(t.sora).put(path, NOTE));
    expect(written).toMatchObject({ hasCareNote: true, updatedByName: 'Sora Park', reveals: 0 });

    // The roster flags the row; the content is not in the list.
    const rosterText = await (await api(t.nate).get(`${t.base}/roster`)).text();
    const rows = (JSON.parse(rosterText) as RosterResponse)
      .participations as (RosterResponse['participations'][number] & {
      hasCareNote: boolean;
    })[];
    expect(rows.find((p) => p.displayName === 'Minji Park')?.hasCareNote).toBe(true);
    expect(rows.find((p) => p.displayName === 'Juho Kim')?.hasCareNote).toBe(false);
    expect(rosterText).not.toContain('EpiPen');

    // Reveals.
    const revealed = await json<RevealCareNoteResponse>(await api(t.kim).post(`${path}/reveal`));
    expect(revealed.note).toEqual(NOTE);
    expect(revealed.updatedByName).toBe('Sora Park');
    expect((await api(t.choi).post(`${path}/reveal`)).status).toBe(403);
    expect((await api(t.juho).post(`${path}/reveal`)).status).toBe(403);
    expect((await api(t.hana).post(`${path}/reveal`)).status).toBe(403);
    expect((await api(t.hanaMom).post(`${path}/reveal`)).status).toBe(403);
    expect((await api(t.minji).post(`${path}/reveal`)).status).toBe(200);
    expect((await api(t.sora).post(`${path}/reveal`)).status).toBe(200);
    expect((await api(t.nate).post(`${path}/reveal`)).status).toBe(200);
    expect(await json<CareNoteStatus>(await api(t.nate).get(path))).toMatchObject({ reveals: 4 });

    // Every reveal and the write are facts on the timeline, without the content.
    const timelineText = await (
      await api(t.nate).get(`${t.base}/people/${t.minjiId}/timeline`)
    ).text();
    const entries = (JSON.parse(timelineText) as PersonTimeline).entries;
    expect(
      entries
        .filter((e) => e.kind === 'care_reveal')
        .map((e) => e.title)
        .sort(),
    ).toEqual([
      'Care note revealed by guardian Sora Park',
      'Care note revealed by leader Kim',
      'Care note revealed by owner Owner',
      'Care note revealed by traveler Minji Park',
    ]);
    expect(entries.find((e) => e.kind === 'care_update')?.title).toBe(
      'Care note updated by guardian Sora Park',
    );
    expect(timelineText).not.toContain('EpiPen');

    // The organizer clears it with a blank note: the flag drops, the audit stays, reveal is 404.
    const cleared = await json<CareNoteStatus>(
      await api(t.nate).put(path, { allergies: '', medications: '  ', freeText: '' }),
    );
    expect(cleared).toMatchObject({ hasCareNote: false, updatedByName: null, reveals: 4 });
    expect((await api(t.kim).post(`${path}/reveal`)).status).toBe(404);

    // Not a traveler: 404 on every care route.
    expect((await api(t.nate).put(`${t.base}/people/${t.kimId}/care-note`, NOTE)).status).toBe(404);
    expect((await api(t.nate).get(`${t.base}/people/${t.kimId}/care-note`)).status).toBe(404);
  });
});
