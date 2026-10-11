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
import { resolveSession } from './service';

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
      };
      c.set('auth', auth);
    }
  }
  await next();
});

export function requireAuth(c: { get: (k: 'auth') => AuthContext | undefined }): AuthContext {
  const auth = c.get('auth');
  if (!auth) throw new HTTPException(401, { message: 'Sign in required.' });
  return auth;
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
