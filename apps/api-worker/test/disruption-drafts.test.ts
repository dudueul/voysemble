// Copyright 2026- At Day. All rights reserved.
// Facts (D19, slice 055): an organizer asks for drafts with the propagated chain and gets the
// fixture's three (provider fixture) in the asked language; a leader cannot ask; an unknown trip
// is 404; a body without events fails validation.

import type { DisruptionDraftRequest, DisruptionDraftResponse } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

const E1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const E2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const E3 = 'aaaaaaaa-0000-4000-8000-000000000003';

const body: DisruptionDraftRequest = {
  date: '2026-12-28',
  slippedEventId: E1,
  minutes: 20,
  locale: 'ko',
  events: [
    {
      id: E1,
      title: 'Breakfast',
      kind: 'meal',
      start: '09:00',
      end: '10:00',
      newStart: '09:20',
      newEnd: '10:20',
    },
    {
      id: E2,
      title: 'Bus to Colosseum',
      kind: 'bus',
      start: '10:10',
      end: null,
      newStart: '10:20',
      newEnd: null,
    },
    {
      id: E3,
      title: 'Forum walk',
      kind: 'activity',
      start: '14:00',
      end: '16:00',
      newStart: null,
      newEnd: null,
    },
  ],
};

describe('disruption drafts (slice 055)', () => {
  it('answers the organizer from the fixture port, in the asked language; refuses a leader', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    const trip = await createTrip(nate, org.id);
    const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
    const r = await api(nate).post(`${base}/itinerary/disruption-drafts`, body);
    expect(r.status).toBe(200);
    const drafts = await json<DisruptionDraftResponse>(r);
    expect(drafts.provider).toBe('fixture');
    expect(drafts.drafts.map((d) => d.title)).toEqual([
      '지연을 그대로 흡수',
      'Forum walk 단축',
      'Forum walk 취소',
    ]);
    expect(drafts.drafts[1]?.actions.find((a) => a.eventId === E3)).toEqual({
      eventId: E3,
      action: 'shorten',
      start: '14:00',
      end: '15:40',
    });

    await api(nate).post(`${base}/roster/import`, { csv: SAMPLE_CSV });
    await api(nate).post(`${base}/roster/leaders`, { displayName: 'Kim', groupName: 'Bus A' });
    const issued = await json<{ invites: { displayName: string; code: string }[] }>(
      await api(nate).post(`${base}/invites`),
    );
    const kim = await signIn('kim@example.com');
    const code = issued.invites.find((i) => i.displayName === 'Kim')?.code;
    expect((await api(kim).post('/v1/invites/redeem', { code })).status).toBe(200);
    expect((await api(kim).post(`${base}/itinerary/disruption-drafts`, body)).status).toBe(403);

    expect(
      (
        await api(nate).post(
          `/v1/orgs/${org.id}/trips/${crypto.randomUUID()}/itinerary/disruption-drafts`,
          body,
        )
      ).status,
    ).toBe(404);
    expect(
      (await api(nate).post(`${base}/itinerary/disruption-drafts`, { ...body, events: [] })).status,
    ).toBe(400);
  });
});
