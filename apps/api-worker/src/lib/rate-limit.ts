// Copyright 2026- At Day. All rights reserved.
//
// Rate limits for the endpoints anyone can call (slice 041): the magic-link request (one email
// per link, so a flood is a mailbox attack and a cost), the verify endpoint (token guessing) and
// the invite redeem (code guessing). Limits are per subject: the email (hashed in the object
// name), the caller's address when Cloudflare gives one (`cf-connecting-ip`; absent in the worker
// tests and loopback under `wrangler dev`, so address limits never bite a developer or the
// browser suite), and the signed-in account. A refused call
// is 429 RATE_LIMITED with Retry-After, the same body shape as every other error. Slice 042 adds
// one authenticated endpoint that sends email on the caller's behalf (organizer invitations), capped
// per organization.

import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../env';

export type Limit = { limit: number; windowSeconds: number };

/** The policy, in one place. Windows in seconds. */
export const LIMITS = {
  /** Links to one address: five per quarter hour. */
  magicLinkEmail: { limit: 5, windowSeconds: 900 },
  /** Link requests from one address, whatever the email: twenty per quarter hour. */
  magicLinkIp: { limit: 20, windowSeconds: 900 },
  /** Verify attempts from one address: fifteen per quarter hour (a token is 128 bits; this is for noise). */
  verifyIp: { limit: 15, windowSeconds: 900 },
  /** Invite codes tried by one account: ten per hour (a code is 8 characters from 32). */
  redeemAccount: { limit: 10, windowSeconds: 3600 },
  /** Invite codes tried from one address: thirty per hour. */
  redeemIp: { limit: 30, windowSeconds: 3600 },
  /** Organizer invitations sent by one organization (slice 042): twenty per hour, each an email. */
  organizerInviteOrg: { limit: 20, windowSeconds: 3600 },
  /** Driver sheet opens from one address (slice 049): sixty per quarter hour (a token is 256 bits; this is for noise). */
  driverIp: { limit: 60, windowSeconds: 900 },
  /** Hotel sheet opens from one address (slice 058): sixty per quarter hour, as the driver's. */
  hotelIp: { limit: 60, windowSeconds: 900 },
  /** Disruption drafts asked by one account (slice 055): thirty per hour, each a model call. */
  disruptionDraftsAccount: { limit: 30, windowSeconds: 3600 },
} as const satisfies Record<string, Limit>;

/** A 429 that carries how long to wait; app.ts turns it into the header. */
export class RateLimitedError extends HTTPException {
  constructor(readonly retryAfterSeconds: number) {
    super(429, { message: 'Too many attempts. Try again later.' });
  }
}

/** Loopback addresses as `wrangler dev` reports them; Cloudflare's edge never reports one. */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * The caller's address as Cloudflare reports it. Null (no address limit) without the header, as
 * in the worker tests, and for a loopback caller: `wrangler dev` sets the header to 127.0.0.1 for
 * every request, and the browser suite signs in dozens of times from one machine (CI run
 * 38252080198 tripped the twenty-link limit halfway through the suite).
 */
export function clientIp(c: Context<AppEnv>): string | null {
  const ip = c.req.header('cf-connecting-ip')?.trim() || null;
  return ip && !LOOPBACK.has(ip) ? ip : null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** One check: `subject` under `scope`; emails are hashed so the object name never spells one. */
export type Check = { scope: keyof typeof LIMITS; subject: string | null; hash?: boolean };

/**
 * Count the call against every check and refuse it on the first exhausted one. A null subject
 * (no address known) skips its check. Counts are per `scope:subject`, so the email and the
 * address of one request are two objects and never confuse each other.
 */
export async function enforceLimits(c: Context<AppEnv>, checks: Check[]): Promise<void> {
  for (const check of checks) {
    if (!check.subject) continue;
    const subject = check.hash ? await sha256Hex(check.subject.toLowerCase()) : check.subject;
    const stub = c.env.RATE_LIMIT_DO.get(
      c.env.RATE_LIMIT_DO.idFromName(`${check.scope}:${subject}`),
    );
    const { limit, windowSeconds } = LIMITS[check.scope];
    const result = await stub.hit(limit, windowSeconds);
    if (!result.allowed) throw new RateLimitedError(result.retryAfterSeconds);
  }
}
