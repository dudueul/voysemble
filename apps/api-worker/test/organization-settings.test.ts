// Copyright 2026- At Day. All rights reserved.
// Facts (slice 036): a new organization carries the decisions' defaults (Asia/Seoul, quiet
// 23:00–06:30, digest 19:00, 90 days); the owner changes the name, language and settings in one
// PATCH and the list reads the new name; an unknown zone, a bad clock and a window outside 30–365
// are 400; a leader reads the profile but cannot write it or list members (403); a stranger is 403
// on all three; the member list puts the owner first with `you` on the caller's row.

import { OrganizationList, OrganizationProfile, OrgMemberList } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

describe('organization settings (slice 036)', () => {
  it('defaults, the owner PATCH, validation, and the member list', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    const profile = OrganizationProfile.parse(
      await json(await api(nate).get(`/v1/orgs/${org.id}`)),
    );
    expect(profile).toMatchObject({
      id: org.id,
      name: 'Seoul Arts High',
      defaultLocale: 'ko',
      role: 'owner',
      settings: {
        timeZone: 'Asia/Seoul',
        quietHours: { from: '23:00', to: '06:30' },
        guardianDigestAt: '19:00',
        wrapUpDays: 90,
      },
    });

    const updated = OrganizationProfile.parse(
      await json(
        await api(nate).patch(`/v1/orgs/${org.id}`, {
          name: 'Seoul Arts High School',
          defaultLocale: 'en',
          settings: {
            timeZone: 'Europe/Rome',
            quietHours: { from: '22:30', to: '07:00' },
            wrapUpDays: 120,
          },
        }),
      ),
    );
    expect(updated).toMatchObject({
      name: 'Seoul Arts High School',
      defaultLocale: 'en',
      settings: {
        timeZone: 'Europe/Rome',
        quietHours: { from: '22:30', to: '07:00' },
        guardianDigestAt: '19:00',
        wrapUpDays: 120,
      },
    });
    const list = OrganizationList.parse(await json(await api(nate).get('/v1/orgs')));
    expect(list.organizations[0]).toMatchObject({
      name: 'Seoul Arts High School',
      defaultLocale: 'en',
    });
    // An empty patch changes nothing and still answers the profile.
    const same = OrganizationProfile.parse(
      await json(await api(nate).patch(`/v1/orgs/${org.id}`, {})),
    );
    expect(same.settings.wrapUpDays).toBe(120);

    // Validation.
    const badZone = await api(nate).patch(`/v1/orgs/${org.id}`, {
      settings: { timeZone: 'Mars/Olympus' },
    });
    expect(badZone.status).toBe(400);
    const badClock = await api(nate).patch(`/v1/orgs/${org.id}`, {
      settings: { guardianDigestAt: '7pm' },
    });
    expect(badClock.status).toBe(400);
    const badWindow = await api(nate).patch(`/v1/orgs/${org.id}`, { settings: { wrapUpDays: 10 } });
    expect(badWindow.status).toBe(400);
    expect((await api(nate).patch(`/v1/orgs/${org.id}`, { name: '' })).status).toBe(400);

    // A leader who joined by invite reads the profile, cannot write it, cannot list members.
    const trip = await createTrip(nate, org.id);
    const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
    await api(nate).post(`${base}/roster/import`, { csv: SAMPLE_CSV });
    await api(nate).post(`${base}/roster/leaders`, { displayName: 'Kim', groupName: 'Bus A' });
    const issued = await json<{ invites: { displayName: string; code: string }[] }>(
      await api(nate).post(`${base}/invites`),
    );
    const kim = await signIn('kim@example.com');
    const code = issued.invites.find((i) => i.displayName === 'Kim')?.code;
    expect((await api(kim).post('/v1/invites/redeem', { code })).status).toBe(200);
    const kimView = OrganizationProfile.parse(await json(await api(kim).get(`/v1/orgs/${org.id}`)));
    expect(kimView.role).toBe('leader');
    expect(kimView.settings.timeZone).toBe('Europe/Rome');
    expect((await api(kim).patch(`/v1/orgs/${org.id}`, { name: 'Kim Org' })).status).toBe(403);
    expect((await api(kim).get(`/v1/orgs/${org.id}/members`)).status).toBe(403);

    // A stranger is 403 everywhere, same as an unknown organization.
    const other = await signIn('other@example.com');
    expect((await api(other).get(`/v1/orgs/${org.id}`)).status).toBe(403);
    expect((await api(other).patch(`/v1/orgs/${org.id}`, { name: 'x' })).status).toBe(403);
    expect((await api(other).get(`/v1/orgs/${org.id}/members`)).status).toBe(403);
    expect((await api(other).get(`/v1/orgs/${crypto.randomUUID()}`)).status).toBe(403);
    expect((await api(null).get(`/v1/orgs/${org.id}`)).status).toBe(401);

    // Members: the owner first, then the leader; `you` on the caller's row.
    const members = OrgMemberList.parse(
      await json(await api(nate).get(`/v1/orgs/${org.id}/members`)),
    );
    expect(members.members.map((m) => [m.email, m.role, m.you])).toEqual([
      ['nate@example.com', 'owner', true],
      ['kim@example.com', 'leader', false],
    ]);
  });
});
