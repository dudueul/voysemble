// Copyright 2026- At Day. All rights reserved.
//
// Magic-link sign-in and session lifecycle (ADR-0007). Pure data operations over D1; HTTP
// concerns (cookies, headers) stay in routes/middleware.
//
// Invariants:
// - Only token hashes are stored. A token is valid once (magic link) or until expiry/revocation
//   (session). Expiry is checked on every lookup, never trusted from the client.
// - Requesting a magic link never reveals whether an account exists.
// - Sessions slide: 30 days idle, 90 days absolute.

import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { accounts, magicLinks, sessions } from '../db/schema';
import { isPast, nowIso, plusSeconds, SECONDS } from '../lib/time';
import { hashToken, randomToken } from '../lib/tokens';

export const MAGIC_LINK_TTL_SECONDS = 15 * SECONDS.minute;
export const SESSION_IDLE_SECONDS = 30 * SECONDS.day;
export const SESSION_ABSOLUTE_SECONDS = 90 * SECONDS.day;
/** last_seen_at/expires_at are only rewritten when older than this, to spare D1 writes. */
const SESSION_TOUCH_INTERVAL_SECONDS = SECONDS.hour;

export type Account = typeof accounts.$inferSelect;
export type Session = typeof sessions.$inferSelect;

export async function issueMagicLink(
  d: Db,
  email: string,
  locale: 'ko' | 'en',
): Promise<{ token: string; expiresAt: string }> {
  const token = randomToken();
  const createdAt = nowIso();
  const expiresAt = plusSeconds(createdAt, MAGIC_LINK_TTL_SECONDS);
  await d.insert(magicLinks).values({
    tokenHash: hashToken(token),
    email: email.toLowerCase(),
    locale,
    createdAt,
    expiresAt,
  });
  return { token, expiresAt };
}

export type VerifyResult =
  | { ok: true; account: Account; isNewAccount: boolean; session: Session; sessionToken: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'consumed' };

/** Consumes the magic link, creates the account on first sign-in, mints a session. */
export async function verifyMagicLink(
  d: Db,
  token: string,
  client: 'web' | 'native',
): Promise<VerifyResult> {
  const tokenHash = hashToken(token);
  const link = await d.query.magicLinks.findFirst({ where: eq(magicLinks.tokenHash, tokenHash) });
  if (!link) return { ok: false, reason: 'invalid' };
  if (link.consumedAt) return { ok: false, reason: 'consumed' };
  const now = nowIso();
  if (isPast(link.expiresAt, now)) return { ok: false, reason: 'expired' };

  // Mark consumed first: a concurrent second verify must lose. D1 UPDATE ... WHERE consumed_at
  // IS NULL is atomic per statement.
  const consumed = await d
    .update(magicLinks)
    .set({ consumedAt: now })
    .where(and(eq(magicLinks.tokenHash, tokenHash), isNull(magicLinks.consumedAt)))
    .returning({ tokenHash: magicLinks.tokenHash });
  if (consumed.length === 0) return { ok: false, reason: 'consumed' };

  let account = await d.query.accounts.findFirst({ where: eq(accounts.email, link.email) });
  let isNewAccount = false;
  if (!account) {
    isNewAccount = true;
    const [created] = await d
      .insert(accounts)
      .values({ id: crypto.randomUUID(), email: link.email, locale: link.locale, createdAt: now })
      .returning();
    if (!created) throw new Error('account insert returned no row');
    account = created;
  }
  await d.update(accounts).set({ lastLoginAt: now }).where(eq(accounts.id, account.id));

  const { session, sessionToken } = await createSession(d, account.id, client, now);
  return { ok: true, account, isNewAccount, session, sessionToken };
}

export async function createSession(
  d: Db,
  accountId: string,
  client: 'web' | 'native',
  now = nowIso(),
): Promise<{ session: Session; sessionToken: string }> {
  const sessionToken = randomToken();
  const [session] = await d
    .insert(sessions)
    .values({
      id: crypto.randomUUID(),
      accountId,
      tokenHash: hashToken(sessionToken),
      client,
      createdAt: now,
      expiresAt: plusSeconds(now, SESSION_IDLE_SECONDS),
      lastSeenAt: now,
    })
    .returning();
  if (!session) throw new Error('session insert returned no row');
  return { session, sessionToken };
}

/** Resolves a presented token to a live session + account, sliding expiry as a side effect. */
export async function resolveSession(
  d: Db,
  sessionToken: string,
): Promise<{ session: Session; account: Account } | null> {
  const session = await d.query.sessions.findFirst({
    where: eq(sessions.tokenHash, hashToken(sessionToken)),
  });
  if (!session || session.revokedAt) return null;
  const now = nowIso();
  if (isPast(session.expiresAt, now)) return null;
  const account = await d.query.accounts.findFirst({ where: eq(accounts.id, session.accountId) });
  if (!account) return null;

  if (isPast(plusSeconds(session.lastSeenAt, SESSION_TOUCH_INTERVAL_SECONDS), now)) {
    const absoluteCap = plusSeconds(session.createdAt, SESSION_ABSOLUTE_SECONDS);
    const slid = plusSeconds(now, SESSION_IDLE_SECONDS);
    const expiresAt = slid < absoluteCap ? slid : absoluteCap;
    await d.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, session.id));
    return { session: { ...session, lastSeenAt: now, expiresAt }, account };
  }
  return { session, account };
}

export async function revokeSession(d: Db, sessionId: string): Promise<void> {
  await d.update(sessions).set({ revokedAt: nowIso() }).where(eq(sessions.id, sessionId));
}

/**
 * Lost or stolen device (D28): revoke every live session of the account (phone and browser; a
 * lost phone has both) with the wipe directive, except the caller's own session, so an organizer
 * who also leads a group and revokes their own row keeps the console they are working in.
 */
export async function revokeSessions(
  d: Db,
  accountId: string,
  exceptSessionId: string | null,
  now = nowIso(),
): Promise<number> {
  const live = await d
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.accountId, accountId), isNull(sessions.revokedAt)))
    .all();
  const targets = live.map((r) => r.id).filter((id) => id !== exceptSessionId);
  for (const id of targets) {
    await d
      .update(sessions)
      .set({ revokedAt: now, revokedReason: 'wipe' })
      .where(eq(sessions.id, id));
  }
  return targets.length;
}

/** True when the presented token belongs to a session revoked with the wipe directive. */
export async function wipeDirectiveFor(d: Db, sessionToken: string): Promise<boolean> {
  const session = await d.query.sessions.findFirst({
    where: eq(sessions.tokenHash, hashToken(sessionToken)),
    columns: { revokedReason: true },
  });
  return session?.revokedReason === 'wipe';
}
