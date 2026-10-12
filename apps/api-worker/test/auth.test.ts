// Copyright 2026- At Day. All rights reserved.
// Facts: magic link is single-use and expiring; web gets a cookie, native gets a token; the
// request endpoint never reveals whether an account exists; logout revokes.

import { env, SELF } from 'cloudflare:test';
import { ErrorEnvelope, MeResponse, SessionResponse } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { FixtureEmailPort } from '../src/email/EmailPort';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

async function requestLink(email: string): Promise<string> {
  const res = await SELF.fetch('https://example.com/v1/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, locale: 'ko' }),
  });
  expect(res.status).toBe(202);
  if (!env.DEV_MAILBOX) throw new Error('no mailbox');
  const mail = await FixtureEmailPort.latest(env.DEV_MAILBOX, email);
  const token = /#token=([A-Za-z0-9_-]+)/.exec(mail?.text ?? '')?.[1];
  if (!token) throw new Error('no token');
  expect(mail?.tag).toBe('magic-link');
  expect(mail?.locale).toBe('ko');
  return token;
}

describe('magic link sign-in', () => {
  it('same 202 for unknown and known addresses', async () => {
    const first = await SELF.fetch('https://example.com/v1/auth/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com' }),
    });
    expect(first.status).toBe(202);
    const body = await json<{ accepted: boolean; expiresInSeconds: number }>(first);
    expect(body.accepted).toBe(true);
    expect(body.expiresInSeconds).toBe(900);
  });

  it('web verify sets an HttpOnly cookie and does not return the token', async () => {
    const token = await requestLink('web@example.com');
    const res = await SELF.fetch('https://example.com/v1/auth/magic-link/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, client: 'web' }),
    });
    expect(res.status).toBe(200);
    const body = SessionResponse.parse(await res.json());
    expect(body.isNewAccount).toBe(true);
    expect(body.sessionToken).toBeUndefined();
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^vy_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);

    // The cookie authenticates /v1/me.
    const value = cookie.split(';')[0] ?? '';
    const me = await SELF.fetch('https://example.com/v1/me', { headers: { cookie: value } });
    expect(me.status).toBe(200);
    expect(MeResponse.parse(await me.json()).email).toBe('web@example.com');
  });

  it('a token works once; second use is 401', async () => {
    const token = await requestLink('once@example.com');
    const first = await SELF.fetch('https://example.com/v1/auth/magic-link/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, client: 'native' }),
    });
    expect(first.status).toBe(200);
    const second = await SELF.fetch('https://example.com/v1/auth/magic-link/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, client: 'native' }),
    });
    expect(second.status).toBe(401);
    expect(ErrorEnvelope.parse(await second.json()).error.code).toBe('UNAUTHENTICATED');
  });

  it('a garbage token is 401, not 500', async () => {
    const res = await SELF.fetch('https://example.com/v1/auth/magic-link/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'x'.repeat(43), client: 'native' }),
    });
    expect(res.status).toBe(401);
  });

  it('second sign-in with the same email reuses the account', async () => {
    const a = await signIn('Repeat@Example.com');
    const b = await signIn('repeat@example.com');
    expect(a.accountId).toBe(b.accountId);
  });

  it('PATCH /v1/me changes the account language and the next /v1/me reads it (slice 038)', async () => {
    const nate = await signIn('nate@example.com');
    const before = await json<{ locale: string }>(await api(nate).get('/v1/me'));
    expect(before.locale).toBe('en');
    const changed = await json<{ locale: string; email: string }>(
      await api(nate).patch('/v1/me', { locale: 'ko' }),
    );
    expect(changed).toMatchObject({ email: 'nate@example.com', locale: 'ko' });
    expect((await json<{ locale: string }>(await api(nate).get('/v1/me'))).locale).toBe('ko');
    expect((await api(nate).patch('/v1/me', { locale: 'fr' })).status).toBe(400);
    expect((await api(null).patch('/v1/me', { locale: 'ko' })).status).toBe(401);
  });

  it('PATCH /v1/me sets the account name, which names the organizer on a trip (slice 069)', async () => {
    const nate = await signIn('nate-name@example.com');
    expect((await json<MeResponse>(await api(nate).get('/v1/me'))).displayName).toBeNull();
    const named = await json<MeResponse>(
      await api(nate).patch('/v1/me', { displayName: '  Nate Kim ' }),
    );
    expect(named).toMatchObject({ displayName: 'Nate Kim', locale: 'en' });
    // A language change keeps the name; blank and too long are 400; null clears it.
    expect(
      (await json<MeResponse>(await api(nate).patch('/v1/me', { locale: 'ko' }))).displayName,
    ).toBe('Nate Kim');
    expect((await api(nate).patch('/v1/me', { displayName: '   ' })).status).toBe(400);
    expect((await api(nate).patch('/v1/me', { displayName: 'x'.repeat(81) })).status).toBe(400);
    expect((await api(nate).patch('/v1/me', {})).status).toBe(200);
    expect((await json<MeResponse>(await api(nate).get('/v1/me'))).displayName).toBe('Nate Kim');
    // Slice 081: the incident emails switch, on by default, off and on again; a non-boolean is 400.
    expect(named.incidentEmails).toBe(true);
    expect(
      (await json<MeResponse>(await api(nate).patch('/v1/me', { incidentEmails: false })))
        .incidentEmails,
    ).toBe(false);
    expect((await json<MeResponse>(await api(nate).get('/v1/me'))).incidentEmails).toBe(false);
    expect((await api(nate).patch('/v1/me', { incidentEmails: 'no' })).status).toBe(400);
    expect(
      (await json<MeResponse>(await api(nate).patch('/v1/me', { incidentEmails: true })))
        .incidentEmails,
    ).toBe(true);
    // On a trip, what the organizer does carries the name instead of "Owner".
    const org = await createOrg(nate);
    const trip = await createTrip(nate, org.id);
    const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
    const imported = await json<{ participations: { id: string; displayName: string }[] }>(
      await api(nate).post(`${base}/roster/import`, { csv: SAMPLE_CSV }),
    );
    const minji = imported.participations.find((p) => p.displayName === 'Minji Park')?.id ?? '';
    const fee = await json<{ updatedByName: string }>(
      await api(nate).patch(`${base}/fees/${minji}`, { amountDueMinor: 1000, paidMinor: 1000 }),
    );
    expect(fee.updatedByName).toBe('Nate Kim');
    const sent = await json<{ senderName: string; senderRole: string }>(
      await api(nate).post(`${base}/chats/trip/messages`, { body: 'Welcome aboard.' }),
    );
    expect(sent).toMatchObject({ senderName: 'Nate Kim', senderRole: 'owner' });
    expect(
      (await json<MeResponse>(await api(nate).patch('/v1/me', { displayName: null }))).displayName,
    ).toBeNull();
    const again = await json<{ senderName: string }>(
      await api(nate).post(`${base}/chats/trip/messages`, { body: 'And again.' }),
    );
    expect(again.senderName).toBe('Owner');
  });

  it('/v1/me without a session is 401; logout revokes the token', async () => {
    const anon = await SELF.fetch('https://example.com/v1/me');
    expect(anon.status).toBe(401);
    const client = await signIn('bye@example.com');
    expect((await api(client).get('/v1/me')).status).toBe(200);
    expect((await api(client).post('/v1/auth/logout')).status).toBe(200);
    expect((await api(client).get('/v1/me')).status).toBe(401);
  });
});
