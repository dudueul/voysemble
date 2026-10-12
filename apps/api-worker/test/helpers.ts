// Copyright 2026- At Day. All rights reserved.
// Test helpers: drive the real HTTP surface through SELF so every test proves a client path.

import { env, SELF } from 'cloudflare:test';
import type { Organization, Trip } from '@voysemble/contracts';
import { expect } from 'vitest';
import { FixtureEmailPort } from '../src/email/EmailPort';

export type Client = { token: string; accountId: string; email: string };

export async function json<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** Full magic-link round trip as a native client; returns a bearer token. */
export async function signIn(email: string): Promise<Client> {
  const req = await SELF.fetch('https://example.com/v1/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, locale: 'en' }),
  });
  expect(req.status).toBe(202);
  if (!env.DEV_MAILBOX) throw new Error('DEV_MAILBOX missing in test env');
  const mail = await FixtureEmailPort.latest(env.DEV_MAILBOX, email.toLowerCase());
  if (!mail) throw new Error('no magic-link mail captured');
  const token = /#token=([A-Za-z0-9_-]+)/.exec(mail.text)?.[1];
  if (!token) throw new Error('token missing from mail body');
  const verify = await SELF.fetch('https://example.com/v1/auth/magic-link/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, client: 'native' }),
  });
  expect(verify.status).toBe(200);
  const body = await json<{ accountId: string; sessionToken: string }>(verify);
  return { token: body.sessionToken, accountId: body.accountId, email: email.toLowerCase() };
}

export function api(client: Client | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (client) headers.Authorization = `Bearer ${client.token}`;
  return {
    get: (path: string) => SELF.fetch(`https://example.com${path}`, { headers }),
    post: (path: string, body?: unknown) =>
      SELF.fetch(`https://example.com${path}`, {
        method: 'POST',
        headers,
        body: body === undefined ? null : JSON.stringify(body),
      }),
    delete: (path: string) =>
      SELF.fetch(`https://example.com${path}`, { method: 'DELETE', headers }),
    put: (path: string, body?: unknown) =>
      SELF.fetch(`https://example.com${path}`, {
        method: 'PUT',
        headers,
        body: body === undefined ? null : JSON.stringify(body),
      }),
    patch: (path: string, body?: unknown) =>
      SELF.fetch(`https://example.com${path}`, {
        method: 'PATCH',
        headers,
        body: body === undefined ? null : JSON.stringify(body),
      }),
  };
}

export async function createOrg(client: Client, name = 'Seoul Arts High'): Promise<Organization> {
  const res = await api(client).post('/v1/orgs', { name, defaultLocale: 'ko' });
  expect(res.status).toBe(201);
  return json<Organization>(res);
}

export async function createTrip(client: Client, orgId: string): Promise<Trip> {
  const res = await api(client).post(`/v1/orgs/${orgId}/trips`, {
    name: 'Korea Concert Tour',
    startsOn: '2026-12-26',
    endsOn: '2027-01-07',
    timezone: 'Asia/Seoul',
  });
  expect(res.status).toBe(201);
  return json<Trip>(res);
}

export const SAMPLE_CSV = [
  'name,group,guardian_name,guardian_contact',
  'Minji Park,Bus A,Sora Park,sora@example.com',
  'Juho Kim,Bus A,,',
  '"Lee, Hana",Bus B,Hana Mom,hm@example.com',
].join('\n');
