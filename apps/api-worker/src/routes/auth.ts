// Copyright 2026- At Day. All rights reserved.
//
// /v1/auth/*: magic-link request and verify, logout. /v1/me: current account and memberships.
// Web clients get an HttpOnly cookie; native clients get the token once in the body (ADR-0007).

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  LogoutResponse,
  MagicLinkAccepted,
  MagicLinkRequest,
  MagicLinkVerifyRequest,
  MeResponse,
  MyParticipationList,
  SessionResponse,
} from '@voysemble/contracts';
import { eq } from 'drizzle-orm';
import { deleteCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { requireAuth, SESSION_COOKIE } from '../auth/middleware';
import {
  issueMagicLink,
  MAGIC_LINK_TTL_SECONDS,
  revokeSession,
  verifyMagicLink,
} from '../auth/service';
import { db } from '../db/client';
import { memberships, organizations } from '../db/schema';
import { createEmailPort } from '../email/EmailPort';
import { magicLinkEmail } from '../email/templates';
import type { AppEnv } from '../env';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';

const magicLinkRoute = createRoute({
  method: 'post',
  path: '/v1/auth/magic-link',
  tags: ['auth'],
  summary: 'Email a one-time sign-in link',
  request: { body: { content: { 'application/json': { schema: MagicLinkRequest } } } },
  responses: {
    202: {
      description: 'Accepted. Same response whether or not the address has an account.',
      content: { 'application/json': { schema: MagicLinkAccepted } },
    },
    400: ERROR_RESPONSES[400],
    500: ERROR_RESPONSES[500],
  },
});

const verifyRoute = createRoute({
  method: 'post',
  path: '/v1/auth/magic-link/verify',
  tags: ['auth'],
  summary: 'Exchange a magic-link token for a session',
  request: { body: { content: { 'application/json': { schema: MagicLinkVerifyRequest } } } },
  responses: {
    200: {
      description: 'Signed in. Web: Set-Cookie. Native: sessionToken in body.',
      content: { 'application/json': { schema: SessionResponse } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    500: ERROR_RESPONSES[500],
  },
});

const logoutRoute = createRoute({
  method: 'post',
  path: '/v1/auth/logout',
  tags: ['auth'],
  summary: 'Revoke the current session',
  security: SESSION_SECURITY,
  responses: {
    200: {
      description: 'Session revoked and cookie cleared.',
      content: { 'application/json': { schema: LogoutResponse } },
    },
    401: ERROR_RESPONSES[401],
    500: ERROR_RESPONSES[500],
  },
});

const meRoute = createRoute({
  method: 'get',
  path: '/v1/me',
  tags: ['auth'],
  summary: 'Current account and organization memberships',
  security: SESSION_SECURITY,
  responses: {
    200: {
      description: 'The signed-in account.',
      content: { 'application/json': { schema: MeResponse } },
    },
    401: ERROR_RESPONSES[401],
    500: ERROR_RESPONSES[500],
  },
});

const myParticipationsRoute = createRoute({
  method: 'get',
  path: '/v1/me/participations',
  tags: ['auth'],
  summary: 'Trips the caller participates in, across organizations (mobile home screen source)',
  security: SESSION_SECURITY,
  responses: {
    200: {
      description: 'Participations with their trip and organization.',
      content: { 'application/json': { schema: MyParticipationList } },
    },
    401: ERROR_RESPONSES[401],
    500: ERROR_RESPONSES[500],
  },
});

export function mountAuthRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(myParticipationsRoute, async (c) => {
    const auth = requireAuth(c);
    const orgs = await db(c.env.DB)
      .select({ id: organizations.id, name: organizations.name })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(eq(memberships.accountId, auth.accountId))
      .all();
    const participations = [];
    for (const org of orgs) {
      const stub = await orgObject(c.env, org.id);
      for (const row of await stub.participationsForAccount(auth.accountId)) {
        participations.push({
          organizationId: org.id,
          organizationName: org.name,
          tripId: row.trip.id,
          tripName: row.trip.name,
          participation: row.participation,
        });
      }
    }
    return c.json({ participations }, 200);
  });

  app.openapi(magicLinkRoute, async (c) => {
    const { email, locale } = c.req.valid('json');
    const { token } = await issueMagicLink(db(c.env.DB), email, locale);
    // The SPA route /auth/verify reads the fragment and POSTs it to /verify. Fragment, not
    // query: it never reaches server logs or Referer headers.
    const url = `${new URL(c.req.url).origin}/auth/verify#token=${token}`;
    await createEmailPort(c.env).send(magicLinkEmail(email.toLowerCase(), locale, url));
    return c.json({ accepted: true as const, expiresInSeconds: MAGIC_LINK_TTL_SECONDS }, 202);
  });

  app.openapi(verifyRoute, async (c) => {
    const { token, client } = c.req.valid('json');
    const result = await verifyMagicLink(db(c.env.DB), token, client);
    if (!result.ok) {
      throw new HTTPException(401, { message: 'This sign-in link is not valid any more.' });
    }
    const body = {
      accountId: result.account.id,
      email: result.account.email,
      isNewAccount: result.isNewAccount,
      expiresAt: result.session.expiresAt,
      ...(client === 'native' ? { sessionToken: result.sessionToken } : {}),
    };
    if (client === 'web') {
      setCookie(c, SESSION_COOKIE, result.sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/',
        expires: new Date(result.session.expiresAt),
      });
    }
    return c.json(body, 200);
  });

  app.openapi(logoutRoute, async (c) => {
    const auth = requireAuth(c);
    await revokeSession(db(c.env.DB), auth.sessionId);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ loggedOut: true as const }, 200);
  });

  app.openapi(meRoute, async (c) => {
    const auth = requireAuth(c);
    const rows = await db(c.env.DB)
      .select({
        organizationId: memberships.organizationId,
        organizationName: organizations.name,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(eq(memberships.accountId, auth.accountId))
      .all();
    return c.json(
      { accountId: auth.accountId, email: auth.email, locale: auth.locale, memberships: rows },
      200,
    );
  });
}
