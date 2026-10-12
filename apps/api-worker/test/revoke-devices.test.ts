// Copyright 2026- At Day. All rights reserved.
// Facts (D28): revoking a joined traveler's devices signs out her native session (the next call
// is 401 with X-Voysemble-Wipe: 1 and code SESSION_WIPED), reads the row as invited again, lands
// on her timeline, and mints a fresh code the same account redeems on "a new phone" with the same
// participation and group; the old code stays dead; an unjoined row is 409; a leader is 403; the
// organizer's own web session is untouched.

import type { PersonTimeline, RevokeDevicesResponse, RosterResponse } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

describe('device revocation (slice 031)', () => {
  it('signs out the phone, re-issues a code, and the person re-enrols with groups restored', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    const trip = await createTrip(nate, org.id);
    const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
    await api(nate).post(`${base}/roster/import`, { csv: SAMPLE_CSV });
    await api(nate).post(`${base}/roster/leaders`, { displayName: 'Kim', groupName: 'Bus A' });
    const issued = await json<{
      invites: { displayName: string; code: string; participationId: string }[];
    }>(await api(nate).post(`${base}/invites`));
    const invite = (name: string) => issued.invites.find((i) => i.displayName === name);
    const minji = await signIn('minji@example.com');
    expect(
      (await api(minji).post('/v1/invites/redeem', { code: invite('Minji Park')?.code })).status,
    ).toBe(200);
    const kim = await signIn('kim@example.com');
    expect((await api(kim).post('/v1/invites/redeem', { code: invite('Kim')?.code })).status).toBe(
      200,
    );
    const minjiId = invite('Minji Park')?.participationId ?? '';
    const juhoId = invite('Juho Kim')?.participationId ?? '';

    // Guards: a leader cannot; an unjoined row is 409.
    expect((await api(kim).post(`${base}/roster/${minjiId}/revoke-devices`)).status).toBe(403);
    expect((await api(nate).post(`${base}/roster/${juhoId}/revoke-devices`)).status).toBe(409);

    // Revoke.
    const revoked = await json<RevokeDevicesResponse>(
      await api(nate).post(`${base}/roster/${minjiId}/revoke-devices`),
    );
    expect(revoked.revokedSessions).toBe(1);
    expect(revoked.invite).toMatchObject({
      participationId: minjiId,
      role: 'traveler',
      displayName: 'Minji Park',
    });
    expect(revoked.invite.code).not.toBe(invite('Minji Park')?.code);

    // The phone's next request: 401 with the wipe directive, not a plain 401.
    const wiped = await api(minji).get('/v1/me');
    expect(wiped.status).toBe(401);
    expect(wiped.headers.get('x-voysemble-wipe')).toBe('1');
    expect((await json<{ error: { code: string } }>(wiped)).error.code).toBe('SESSION_WIPED');
    // The organizer's web session and Kim's phone are untouched.
    expect((await api(nate).get('/v1/me')).status).toBe(200);
    expect((await api(kim).get('/v1/me')).status).toBe(200);

    // The row reads as invited again and the fact is on the timeline.
    const roster = await json<RosterResponse>(await api(nate).get(`${base}/roster`));
    const row = roster.participations.find((p) => p.id === minjiId);
    expect(row?.accountId).toBeNull();
    expect(row?.invite).toBe('issued');
    const timeline = await json<PersonTimeline>(
      await api(nate).get(`${base}/people/${minjiId}/timeline`),
    );
    expect(timeline.entries.find((e) => e.kind === 'devices_revoked')?.title).toBe(
      'Devices revoked by Owner',
    );

    // Old code dead; the new code re-enrols the same account on "a new phone", same row and group.
    const again = await signIn('minji@example.com');
    expect(
      (await api(again).post('/v1/invites/redeem', { code: invite('Minji Park')?.code })).status,
    ).toBe(409);
    const joined = await api(again).post('/v1/invites/redeem', { code: revoked.invite.code });
    expect(joined.status).toBe(200);
    const body = await json<{ participation: { id: string; groupName: string | null } }>(joined);
    expect(body.participation.id).toBe(minjiId);
    expect(body.participation.groupName).toBe('Bus A');
    expect((await api(again).get('/v1/me')).status).toBe(200);
    // A second revoke on the re-enrolled row works again: the new phone is wiped in turn, and the
    // code it used cannot be reused by a fresh sign-in.
    const second = await json<RevokeDevicesResponse>(
      await api(nate).post(`${base}/roster/${minjiId}/revoke-devices`),
    );
    expect(second.revokedSessions).toBe(1);
    expect((await api(again).get('/v1/me')).headers.get('x-voysemble-wipe')).toBe('1');
    const third = await signIn('minji@example.com');
    expect(
      (await api(third).post('/v1/invites/redeem', { code: revoked.invite.code })).status,
    ).toBe(409);
    expect((await api(third).post('/v1/invites/redeem', { code: second.invite.code })).status).toBe(
      200,
    );
  });
});
