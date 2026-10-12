// Copyright 2026- At Day. All rights reserved.
// Facts (slice 042, D33): the owner emails an organizer invitation (the mail names the organization
// and carries the link, in the organization's language unless told otherwise); the address is
// lower-cased; the invitee accepts only with that address (another account is 403) and becomes
// an organizer who lists members but cannot change settings; a spent link is 409; inviting an
// organizer again is 409; an organizer cannot invite; a re-invitation revokes the earlier pending
// one; the owner revokes (idempotent), an accepted one cannot be revoked; revoked, expired and
// unknown tokens are 404; a leader who accepts is raised, an owner stays; twenty per hour.

import { env } from 'cloudflare:test';
import {
  AcceptInvitationResponse,
  MeResponse,
  OrganizerInvitation,
  OrganizerInvitationList,
  OrgMemberList,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { FixtureEmailPort } from '../src/email/EmailPort';
import { hashToken } from '../src/lib/tokens';
import { api, createOrg, createTrip, json, signIn } from './helpers';

function mailbox(): KVNamespace {
  if (!env.DEV_MAILBOX) throw new Error('DEV_MAILBOX missing in test env');
  return env.DEV_MAILBOX;
}

/** The token of the newest invitation mail for an address. */
async function invitationToken(email: string): Promise<string> {
  const mail = await FixtureEmailPort.latest(mailbox(), email);
  if (!mail) throw new Error('no invitation mail captured');
  expect(mail.tag).toBe('invite');
  const token = /#token=([A-Za-z0-9_-]+)/.exec(mail.text)?.[1];
  if (!token) throw new Error('token missing from the mail body');
  return token;
}

describe('organizer invitations (slice 042)', () => {
  it('the owner invites; the invitee accepts with the same address and organizes', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    const base = `/v1/orgs/${org.id}/invitations`;
    const res = await api(nate).post(base, { email: 'Kim@Example.com' });
    expect(res.status).toBe(201);
    const inv = OrganizerInvitation.parse(await json(res));
    expect(inv).toMatchObject({
      email: 'kim@example.com',
      role: 'organizer',
      status: 'pending',
      invitedBy: 'nate@example.com',
      acceptedAt: null,
      revokedAt: null,
    });
    expect(Date.parse(inv.expiresAt) - Date.parse(inv.createdAt)).toBe(7 * 86_400_000);

    // The mail: the organization's language (ko), its name, the address, the link.
    const mail = await FixtureEmailPort.latest(mailbox(), 'kim@example.com');
    expect(mail?.locale).toBe('ko');
    expect(mail?.text).toContain('Seoul Arts High');
    expect(mail?.text).toContain('kim@example.com');
    expect(mail?.text).toMatch(
      /https:\/\/example\.com\/invitations\/accept#token=[A-Za-z0-9_-]{43}/,
    );
    const token = await invitationToken('kim@example.com');

    const list = OrganizerInvitationList.parse(await json(await api(nate).get(base)));
    expect(list.invitations.map((i) => i.status)).toEqual(['pending']);

    // Another account cannot accept it; nobody can without a session.
    const lee = await signIn('lee@example.com');
    expect((await api(lee).post('/v1/invitations/accept', { token })).status).toBe(403);
    expect((await api(null).post('/v1/invitations/accept', { token })).status).toBe(401);

    // Kim signs in and accepts.
    const kim = await signIn('kim@example.com');
    const ok = AcceptInvitationResponse.parse(
      await json(await api(kim).post('/v1/invitations/accept', { token })),
    );
    expect(ok).toEqual({
      organizationId: org.id,
      organizationName: 'Seoul Arts High',
      role: 'organizer',
      alreadyMember: false,
    });
    const me = MeResponse.parse(await json(await api(kim).get('/v1/me')));
    expect(me.memberships).toEqual([
      { organizationId: org.id, organizationName: 'Seoul Arts High', role: 'organizer' },
    ]);

    // Organizer rights: members and the invitation list, not the settings.
    const members = OrgMemberList.parse(
      await json(await api(kim).get(`/v1/orgs/${org.id}/members`)),
    );
    expect(members.members.map((m) => [m.email, m.role])).toEqual([
      ['nate@example.com', 'owner'],
      ['kim@example.com', 'organizer'],
    ]);
    expect((await api(kim).patch(`/v1/orgs/${org.id}`, { name: 'Kim Org' })).status).toBe(403);
    const after = OrganizerInvitationList.parse(await json(await api(kim).get(base)));
    expect(after.invitations[0]).toMatchObject({ id: inv.id, status: 'accepted' });
    expect(after.invitations[0]?.acceptedAt).not.toBeNull();

    // The link is spent; the address organizes already; an organizer cannot invite; strangers see nothing.
    expect((await api(kim).post('/v1/invitations/accept', { token })).status).toBe(409);
    expect((await api(nate).post(base, { email: 'kim@example.com' })).status).toBe(409);
    expect((await api(kim).post(base, { email: 'park@example.com' })).status).toBe(403);
    expect((await api(lee).get(base)).status).toBe(403);
    expect((await api(lee).post(base, { email: 'park@example.com' })).status).toBe(403);
    expect((await api(null).get(base)).status).toBe(401);
  });

  it('re-invitation, revocation, expiry, unknown tokens and validation', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    const base = `/v1/orgs/${org.id}/invitations`;
    const first = OrganizerInvitation.parse(
      await json(await api(nate).post(base, { email: 'park@example.com' })),
    );
    const firstToken = await invitationToken('park@example.com');

    // A second invitation to the address replaces the first: only the newest link works.
    const second = OrganizerInvitation.parse(
      await json(await api(nate).post(base, { email: 'park@example.com', locale: 'en' })),
    );
    expect(second.id).not.toBe(first.id);
    const secondMail = await FixtureEmailPort.latest(mailbox(), 'park@example.com');
    expect(secondMail?.locale).toBe('en');
    expect(secondMail?.subject).toContain('Seoul Arts High');
    const secondToken = await invitationToken('park@example.com');
    const list = OrganizerInvitationList.parse(await json(await api(nate).get(base)));
    expect(list.invitations.map((i) => [i.id, i.status])).toEqual([
      [second.id, 'pending'],
      [first.id, 'revoked'],
    ]);
    const park = await signIn('park@example.com');
    expect((await api(park).post('/v1/invitations/accept', { token: firstToken })).status).toBe(
      404,
    );

    // The owner revokes the second (idempotent); its link dies; an unknown id is 404.
    const revoked = OrganizerInvitation.parse(
      await json(await api(nate).delete(`${base}/${second.id}`)),
    );
    expect(revoked.status).toBe('revoked');
    expect(revoked.revokedAt).not.toBeNull();
    expect((await api(nate).delete(`${base}/${second.id}`)).status).toBe(200);
    expect((await api(nate).delete(`${base}/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await api(park).post('/v1/invitations/accept', { token: secondToken })).status).toBe(
      404,
    );

    // An expired invitation (written with a past expiry) is 404 and listed as expired.
    const expiredToken = 'x'.repeat(43);
    await env.DB.prepare(
      'INSERT INTO organization_invitations (id, organization_id, email, role, token_hash, locale, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        crypto.randomUUID(),
        org.id,
        'park@example.com',
        'organizer',
        hashToken(expiredToken),
        'en',
        nate.accountId,
        '2026-01-01T00:00:00.000Z',
        '2026-01-08T00:00:00.000Z',
      )
      .run();
    expect((await api(park).post('/v1/invitations/accept', { token: expiredToken })).status).toBe(
      404,
    );
    const statuses = OrganizerInvitationList.parse(
      await json(await api(nate).get(base)),
    ).invitations.map((i) => i.status);
    expect(statuses).toEqual(['revoked', 'revoked', 'expired']);

    // Unknown and malformed tokens; a bad address.
    expect((await api(park).post('/v1/invitations/accept', { token: 'y'.repeat(43) })).status).toBe(
      404,
    );
    expect((await api(park).post('/v1/invitations/accept', { token: 'short' })).status).toBe(400);
    expect((await api(nate).post(base, { email: 'not-an-email' })).status).toBe(400);

    // An accepted invitation cannot be revoked.
    const third = OrganizerInvitation.parse(
      await json(await api(nate).post(base, { email: 'park@example.com' })),
    );
    const thirdToken = await invitationToken('park@example.com');
    expect((await api(park).post('/v1/invitations/accept', { token: thirdToken })).status).toBe(
      200,
    );
    expect((await api(nate).delete(`${base}/${third.id}`)).status).toBe(409);
    // An organizer reads the list but cannot revoke.
    expect((await api(park).get(base)).status).toBe(200);
    expect((await api(park).delete(`${base}/${third.id}`)).status).toBe(403);
  });

  it('a leader who accepts is raised to organizer; an owner stays owner', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    const trip = await createTrip(nate, org.id);
    const tripBase = `/v1/orgs/${org.id}/trips/${trip.id}`;
    await api(nate).post(`${tripBase}/roster/leaders`, { displayName: 'Kim', groupName: 'Bus A' });
    const issued = await json<{ invites: { displayName: string; code: string }[] }>(
      await api(nate).post(`${tripBase}/invites`),
    );
    const kim = await signIn('kim@example.com');
    const code = issued.invites.find((i) => i.displayName === 'Kim')?.code;
    expect((await api(kim).post('/v1/invites/redeem', { code })).status).toBe(200);
    expect((await api(kim).get(`/v1/orgs/${org.id}/members`)).status).toBe(403);

    // The owner invites the leader's address; accepting raises the role, nothing is duplicated.
    const base = `/v1/orgs/${org.id}/invitations`;
    expect((await api(nate).post(base, { email: 'kim@example.com' })).status).toBe(201);
    const token = await invitationToken('kim@example.com');
    const ok = AcceptInvitationResponse.parse(
      await json(await api(kim).post('/v1/invitations/accept', { token })),
    );
    expect(ok).toMatchObject({ role: 'organizer', alreadyMember: false });
    const members = OrgMemberList.parse(
      await json(await api(kim).get(`/v1/orgs/${org.id}/members`)),
    );
    expect(members.members.map((m) => [m.email, m.role])).toEqual([
      ['nate@example.com', 'owner'],
      ['kim@example.com', 'organizer'],
    ]);
    // (Storage persists across the tests of a file: Kim organizes the first test's organization too.)
    const me = MeResponse.parse(await json(await api(kim).get('/v1/me')));
    expect(me.memberships.filter((m) => m.organizationId === org.id).map((m) => m.role)).toEqual([
      'organizer',
    ]);

    // The owner's own address is already an organizer-or-better: 409 before any mail.
    expect((await api(nate).post(base, { email: 'nate@example.com' })).status).toBe(409);
    // A direct row for the owner (as if sent before they owned it) leaves them owner.
    const ownerToken = 'o'.repeat(43);
    await env.DB.prepare(
      'INSERT INTO organization_invitations (id, organization_id, email, role, token_hash, locale, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        crypto.randomUUID(),
        org.id,
        'nate@example.com',
        'organizer',
        hashToken(ownerToken),
        'en',
        nate.accountId,
        '2026-10-12T00:00:00.000Z',
        '2099-01-01T00:00:00.000Z',
      )
      .run();
    const stays = AcceptInvitationResponse.parse(
      await json(await api(nate).post('/v1/invitations/accept', { token: ownerToken })),
    );
    expect(stays).toMatchObject({ role: 'owner', alreadyMember: true });
  });

  it('an organization sends at most twenty invitations an hour', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    const base = `/v1/orgs/${org.id}/invitations`;
    for (let i = 0; i < 20; i++) {
      expect((await api(nate).post(base, { email: `o${i}@example.com` })).status).toBe(201);
    }
    const refused = await api(nate).post(base, { email: 'o20@example.com' });
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('Retry-After'))).toBeGreaterThan(0);
    // The limit is per organization: another organization of the same owner still sends.
    const other = await createOrg(nate, 'Busan Youth Choir');
    expect(
      (await api(nate).post(`/v1/orgs/${other.id}/invitations`, { email: 'o21@example.com' }))
        .status,
    ).toBe(201);
  });
});
