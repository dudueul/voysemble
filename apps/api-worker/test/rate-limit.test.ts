// Copyright 2026- At Day. All rights reserved.
// Facts (slice 041): the sixth magic link for one address in a quarter hour is 429 RATE_LIMITED
// with Retry-After, another address still gets its link, and a caller address is capped across
// addresses; verify attempts from one address are capped; invite codes tried by one account are
// capped; a refused hit is not counted and the window reopens on time (the object's own clock).

import { env, SELF } from 'cloudflare:test';
import { ErrorEnvelope } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { api, signIn } from './helpers';

const JSON_HEADERS = { 'content-type': 'application/json' };

function post(path: string, body: unknown, ip?: string) {
  return SELF.fetch(`https://example.com${path}`, {
    method: 'POST',
    headers: ip ? { ...JSON_HEADERS, 'cf-connecting-ip': ip } : JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

describe('rate limits (slice 041)', () => {
  it('caps magic links per address and per caller, with Retry-After', async () => {
    for (let i = 0; i < 5; i++) {
      expect(
        (await post('/v1/auth/magic-link', { email: 'flood@example.com', locale: 'en' })).status,
      ).toBe(202);
    }
    const sixth = await post('/v1/auth/magic-link', { email: 'flood@example.com', locale: 'en' });
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(ErrorEnvelope.parse(await sixth.json()).error.code).toBe('RATE_LIMITED');
    // The address, not the mailbox: upper case is the same address; another address is fine.
    expect(
      (await post('/v1/auth/magic-link', { email: 'FLOOD@example.com', locale: 'en' })).status,
    ).toBe(429);
    expect(
      (await post('/v1/auth/magic-link', { email: 'calm@example.com', locale: 'en' })).status,
    ).toBe(202);
    // One caller address, many mailboxes: twenty, then no more.
    for (let i = 0; i < 20; i++) {
      expect(
        (
          await post(
            '/v1/auth/magic-link',
            { email: `u${i}@example.com`, locale: 'en' },
            '203.0.113.9',
          )
        ).status,
      ).toBe(202);
    }
    expect(
      (await post('/v1/auth/magic-link', { email: 'u99@example.com', locale: 'en' }, '203.0.113.9'))
        .status,
    ).toBe(429);
    // Another caller is unaffected.
    expect(
      (
        await post(
          '/v1/auth/magic-link',
          { email: 'u99@example.com', locale: 'en' },
          '203.0.113.10',
        )
      ).status,
    ).toBe(202);
  });

  it('caps verify attempts per caller address', async () => {
    for (let i = 0; i < 15; i++) {
      expect(
        (
          await post(
            '/v1/auth/magic-link/verify',
            { token: `guess-${i}`.padEnd(40, 'x'), client: 'web' },
            '198.51.100.7',
          )
        ).status,
      ).toBe(401);
    }
    const next = await post(
      '/v1/auth/magic-link/verify',
      { token: 'guess-16'.padEnd(40, 'x'), client: 'web' },
      '198.51.100.7',
    );
    expect(next.status).toBe(429);
    // Locally (no caller address) the check is skipped: a developer never hits it.
    expect(
      (
        await post('/v1/auth/magic-link/verify', {
          token: 'guess-x'.padEnd(40, 'x'),
          client: 'web',
        })
      ).status,
    ).toBe(401);
    // A loopback caller (what `wrangler dev` reports) is skipped too, however often it calls.
    for (let i = 0; i < 16; i++) {
      expect(
        (
          await post(
            '/v1/auth/magic-link/verify',
            { token: `local-${i}`.padEnd(40, 'x'), client: 'web' },
            i % 2 ? '::1' : '127.0.0.1',
          )
        ).status,
      ).toBe(401);
    }
  });

  it('caps invite codes tried by one account', async () => {
    const nate = await signIn('nate@example.com');
    for (let i = 0; i < 10; i++) {
      expect((await api(nate).post('/v1/invites/redeem', { code: 'AAAA-BBBB' })).status).toBe(404);
    }
    const eleventh = await api(nate).post('/v1/invites/redeem', { code: 'AAAA-BBBB' });
    expect(eleventh.status).toBe(429);
    expect(eleventh.headers.get('retry-after')).toMatch(/^\d+$/);
  });

  it('the object counts a fixed window, never counts a refusal, and reopens on time', async () => {
    const stub = env.RATE_LIMIT_DO.get(env.RATE_LIMIT_DO.idFromName('test:window'));
    const t0 = 1_700_000_000_000;
    expect(await stub.hit(2, 60, t0)).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 0,
    });
    expect(await stub.hit(2, 60, t0 + 1000)).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0,
    });
    expect(await stub.hit(2, 60, t0 + 2000)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 58,
    });
    // Trying again later in the window does not push the window out.
    expect((await stub.hit(2, 60, t0 + 59_000)).retryAfterSeconds).toBe(1);
    expect(await stub.hit(2, 60, t0 + 60_000)).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 0,
    });
  });
});
