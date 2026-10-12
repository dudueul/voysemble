// Copyright 2026- At Day. All rights reserved.
//
// Request authentication and organization authorization.
// - `authenticate` reads the web cookie or the native bearer token, resolves the session, and
//   sets `c.var.auth`. Routes that need a user call `requireAuth`.
// - `requireOrgRole` loads the caller's membership in the path's organization and checks the
//   role. A missing membership is 403, not 404: the org's existence is not disclosed, and the
//   same shape applies to "exists but not yours" (cross-org denial test).

import type { OrgRole } from '@voysemble/contracts';
import { and, eq } from 'drizzle-orm';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db/client';
import { memberships, organizations } from '../db/schema';
import type { AppEnv, AuthContext } from '../env';
import { reauthIsFresh, resolveSession, wipeDirectiveFor } from './service';

/** Response header a wiped session sees on its 401 (D28); the app clears its local state. */
export const WIPE_HEADER = 'X-Voysemble-Wipe';

export const SESSION_COOKIE = 'vy_session';

export const authenticate = createMiddleware<AppEnv>(async (c, next) => {
  let token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    const header = c.req.header('Authorization');
    if (header?.startsWith('Bearer ')) token = header.slice('Bearer '.length).trim();
  }
  if (token) {
    const resolved = await resolveSession(db(c.env.DB), token);
    if (resolved) {
      const auth: AuthContext = {
        accountId: resolved.account.id,
        email: resolved.account.email,
        locale: resolved.account.locale === 'en' ? 'en' : 'ko',
        sessionId: resolved.session.id,
        client: resolved.session.client,
        reauthedAt: resolved.session.reauthedAt,
      };
      c.set('auth', auth);
    } else if (await wipeDirectiveFor(db(c.env.DB), token)) {
      // The organizer revoked this phone (D28). Public routes (a new magic link) still work; any
      // route that needs a session answers 401 SESSION_WIPED with the directive (see requireAuth
      // and the error handler) so the app wipes itself and returns to the invite screen.
      c.set('wiped', true);
    }
  }
  await next();
});

/** Message of the wiped 401; the error handler adds the code and the header. */
export const WIPED_MESSAGE =
  'This device was signed out by the organizer. Sign in again with a new invite code.';

export function requireAuth(c: {
  get: ((k: 'auth') => AuthContext | undefined) & ((k: 'wiped') => boolean | undefined);
}): AuthContext {
  const auth = c.get('auth');
  if (!auth) {
    if (c.get('wiped')) throw new HTTPException(401, { message: WIPED_MESSAGE });
    throw new HTTPException(401, { message: 'Sign in required.' });
  }
  return auth;
}

/** A step-up action without a fresh confirmation (D35); app.ts answers code REAUTH_REQUIRED. */
export class ReauthRequiredError extends HTTPException {
  constructor() {
    super(403, { message: 'Confirm it is you first: we email you a link.' });
  }
}

/** The session must have confirmed itself through a reauth link in the last ten minutes. */
export function requireRecentReauth(auth: AuthContext): void {
  if (!reauthIsFresh(auth.reauthedAt)) throw new ReauthRequiredError();
}

export type OrgAccess = {
  organizationId: string;
  organizationName: string;
  role: OrgRole;
};

/** Role hierarchy for "at least" checks. */
const ORG_ROLE_RANK: Record<OrgRole, number> = { member: 0, leader: 1, organizer: 2, owner: 3 };

export async function requireOrgRole(
  env: Env,
  auth: AuthContext,
  organizationId: string,
  minimum: OrgRole,
): Promise<OrgAccess> {
  const d = db(env.DB);
  const row = await d
    .select({
      role: memberships.role,
      organizationName: organizations.name,
      status: organizations.status,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(
      and(
        eq(memberships.accountId, auth.accountId),
        eq(memberships.organizationId, organizationId),
      ),
    )
    .get();
  if (row?.status !== 'active') {
    throw new HTTPException(403, { message: 'No access to this organization.' });
  }
  if (ORG_ROLE_RANK[row.role] < ORG_ROLE_RANK[minimum]) {
    throw new HTTPException(403, { message: `Requires ${minimum} role.` });
  }
  return { organizationId, organizationName: row.organizationName, role: row.role };
}
