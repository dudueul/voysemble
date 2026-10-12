// Copyright 2026- At Day. All rights reserved.
// Facts (D15): a leader opens a window for a group and its travelers start opted out; a traveler
// lists only their own row with the meeting point while the window is open; reports change the
// state and staff see every member; guardians are 403 everywhere; a non-member cannot report;
// closing erases the meeting point and refuses later reports; a window past its end auto-closes
// on the next read; bad time ranges are 400; the state rule.

import {
  type MeetingWindow,
  type ReportWindowStateResponse,
  type WindowList,
  windowStateOf,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

async function setupTrip() {
  const nate = await signIn('nate@example.com');
  const org = await createOrg(nate);
  const trip = await createTrip(nate, org.id);
  await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/import`, { csv: SAMPLE_CSV });
  await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/leaders`, {
    displayName: 'Kim',
    groupName: 'Bus A',
  });
  const issued = await json<{ invites: { displayName: string; code: string }[] }>(
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
  const hana = await redeem('hana@example.com', 'Lee, Hana');
  const sora = await redeem('sora@example.com', 'Sora Park');
  return { nate, kim, minji, hana, sora, base: `/v1/orgs/${org.id}/trips/${trip.id}/windows` };
}

const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();
const CENTER = { lat: 41.8902, lng: 12.4922 };

describe('meeting windows (slice 029)', () => {
  it('open, list by role, report, close, auto-stop', async () => {
    const { nate, kim, minji, hana, sora, base } = await setupTrip();
    const body = {
      label: 'Colosseum regroup',
      place: 'Colosseum, main entrance',
      radiusMeters: 200,
      startsAt: minutes(-1),
      endsAt: minutes(30),
      groups: ['Bus A'],
      center: CENTER,
    };
    expect((await api(minji).post(base, body)).status).toBe(403);
    expect((await api(sora).post(base, body)).status).toBe(403);
    expect((await api(kim).post(base, { ...body, endsAt: body.startsAt })).status).toBe(400);
    const opened = await json<MeetingWindow>(await api(kim).post(base, body));
    expect(opened).toMatchObject({
      status: 'open',
      openedByName: 'Kim',
      groups: ['Bus A'],
      center: CENTER,
      closedAt: null,
    });
    expect(opened.members.map((m) => [m.displayName, m.state])).toEqual([
      ['Juho Kim', 'opted_out'],
      ['Minji Park', 'opted_out'],
    ]);
    expect(opened.counts).toEqual({
      inside: 0,
      outside: 0,
      uncertain: 0,
      stale: 0,
      optedOut: 2,
      total: 2,
    });

    // Minji sees only herself and the meeting point; Hana (Bus B) is not a member and sees no center.
    const mine = await json<WindowList>(await api(minji).get(base));
    expect(mine.windows[0]?.members.map((m) => m.displayName)).toEqual(['Minji Park']);
    expect(mine.windows[0]?.center).toEqual(CENTER);
    expect(mine.windows[0]?.counts.total).toBe(2);
    const hanas = await json<WindowList>(await api(hana).get(base));
    expect(hanas.windows[0]?.members).toEqual([]);
    expect(hanas.windows[0]?.center).toBeNull();
    expect((await api(hana).put(`${base}/${opened.id}/me`, { state: 'inside' })).status).toBe(403);
    expect((await api(sora).get(base)).status).toBe(403);

    // Reports: Minji inside, then everyone sees it; the organizer lists every member.
    const r1 = await json<ReportWindowStateResponse>(
      await api(minji).put(`${base}/${opened.id}/me`, { state: 'inside' }),
    );
    expect(r1).toMatchObject({ state: 'inside', windowStatus: 'open' });
    expect(r1.reportedAt).toBeTruthy();
    const staffView = await json<WindowList>(await api(nate).get(base));
    expect(staffView.windows[0]?.members.find((m) => m.displayName === 'Minji Park')?.state).toBe(
      'inside',
    );
    expect(staffView.windows[0]?.counts).toMatchObject({ inside: 1, optedOut: 1 });
    const r2 = await json<ReportWindowStateResponse>(
      await api(minji).put(`${base}/${opened.id}/me`, { state: 'opted_out' }),
    );
    expect(r2).toMatchObject({ state: 'opted_out', reportedAt: null });

    // Close early: the meeting point is gone, reports are refused.
    const closed = await json<MeetingWindow>(await api(kim).post(`${base}/${opened.id}/close`));
    expect(closed.status).toBe('closed');
    expect(closed.center).toBeNull();
    expect(closed.closedAt).toBeTruthy();
    expect((await api(minji).put(`${base}/${opened.id}/me`, { state: 'inside' })).status).toBe(409);
    expect((await api(kim).post(`${base}/${crypto.randomUUID()}/close`)).status).toBe(404);

    // Auto-stop: a window whose end is already in the past reads closed on the next list.
    const ending = await json<MeetingWindow>(
      await api(nate).post(base, {
        ...body,
        startsAt: minutes(-30),
        endsAt: minutes(0.01),
        groups: [],
      }),
    );
    expect(ending.counts.total).toBe(3);
    await new Promise((r) => setTimeout(r, 700));
    const later = await json<WindowList>(await api(nate).get(base));
    expect(later.windows.find((w) => w.id === ending.id)).toMatchObject({
      status: 'closed',
      center: null,
    });
    // A scheduled window is not open yet.
    const future = await json<MeetingWindow>(
      await api(kim).post(base, { ...body, startsAt: minutes(10), endsAt: minutes(20) }),
    );
    expect(future.status).toBe('scheduled');
  });

  it('windowStateOf: inside, outside, uncertain from distance and accuracy', () => {
    expect(windowStateOf(50, 20, 200)).toBe('inside');
    expect(windowStateOf(190, 20, 200)).toBe('uncertain');
    expect(windowStateOf(250, 20, 200)).toBe('outside');
    expect(windowStateOf(210, 20, 200)).toBe('uncertain');
    expect(windowStateOf(null, 0, 200)).toBe('uncertain');
  });
});
