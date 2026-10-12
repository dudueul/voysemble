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
  ReauthAccepted,
  ReauthResponse,
  ReauthVerifyRequest,
  SessionResponse,
  UpdateMeRequest,
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
  verifyReauth,
} from '../auth/service';
import { db } from '../db/client';
import { accounts, memberships, organizations } from '../db/schema';
import { createEmailPort } from '../email/EmailPort';
import { magicLinkEmail, reauthEmail } from '../email/templates';
import type { AppEnv } from '../env';
import { clientIp, enforceLimits } from '../lib/rate-limit';
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
    429: ERROR_RESPONSES[429],
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
    429: ERROR_RESPONSES[429],
    500: ERROR_RESPONSES[500],
  },
});

const reauthRoute = createRoute({
  method: 'post',
  path: '/v1/auth/reauth',
  tags: ['auth'],
  summary: 'Email the signed-in account a step-up confirmation link (D35)',
  description:
    'Slice 045. The link lands on the console at /auth/reauth and is verified by this same session; a confirmation covers step-up actions (the document scan reveal) for ten minutes. Same per-address limit as a sign-in link.',
  security: SESSION_SECURITY,
  responses: {
    202: {
      description: 'Sent.',
      content: { 'application/json': { schema: ReauthAccepted } },
    },
    401: ERROR_RESPONSES[401],
    429: ERROR_RESPONSES[429],
    500: ERROR_RESPONSES[500],
  },
});

const reauthVerifyRoute = createRoute({
  method: 'post',
  path: '/v1/auth/reauth/verify',
  tags: ['auth'],
  summary: 'Confirm the session with the token from the reauth link',
  description:
    "The token must carry the reauth purpose and the session's own address; it works once, for 15 minutes. 404 otherwise. A sign-in link never confirms and a reauth link never signs in.",
  security: SESSION_SECURITY,
  request: { body: { content: { 'application/json': { schema: ReauthVerifyRequest } } } },
  responses: {
    200: {
      description: 'Confirmed; step-up actions work until validUntil.',
      content: { 'application/json': { schema: ReauthResponse } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    404: ERROR_RESPONSES[404],
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

const updateMeRoute = createRoute({
  method: 'patch',
  path: '/v1/me',
  tags: ['auth'],
  summary: 'Change the account language (console and emails)',
  description:
    'Slice 038. The console reads it on sign-in; the magic-link and digest emails use it. Answers the same shape as GET /v1/me.',
  security: SESSION_SECURITY,
  request: { body: { content: { 'application/json': { schema: UpdateMeRequest } } } },
  responses: {
    200: {
      description: 'The account after the change.',
      content: { 'application/json': { schema: MeResponse } },
    },
    400: ERROR_RESPONSES[400],
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
          startsOn: row.trip.startsOn,
          endsOn: row.trip.endsOn,
          timezone: row.trip.timezone,
          participation: row.participation,
        });
      }
    }
    return c.json({ participations }, 200);
  });

  app.openapi(magicLinkRoute, async (c) => {
    const { email, locale } = c.req.valid('json');
    // Slice 041: five links per address per quarter hour, twenty requests per caller address.
    await enforceLimits(c, [
      { scope: 'magicLinkEmail', subject: email, hash: true },
      { scope: 'magicLinkIp', subject: clientIp(c) },
    ]);
    const { token } = await issueMagicLink(db(c.env.DB), email, locale);
    // The SPA route /auth/verify reads the fragment and POSTs it to /verify. Fragment, not
    // query: it never reaches server logs or Referer headers.
    const url = `${new URL(c.req.url).origin}/auth/verify#token=${token}`;
    await createEmailPort(c.env).send(magicLinkEmail(email.toLowerCase(), locale, url));
    return c.json({ accepted: true as const, expiresInSeconds: MAGIC_LINK_TTL_SECONDS }, 202);
  });

  app.openapi(verifyRoute, async (c) => {
    const { token, client } = c.req.valid('json');
    await enforceLimits(c, [{ scope: 'verifyIp', subject: clientIp(c) }]);
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

  app.openapi(reauthRoute, async (c) => {
    const auth = requireAuth(c);
    await enforceLimits(c, [{ scope: 'magicLinkEmail', subject: auth.email, hash: true }]);
    const { token } = await issueMagicLink(db(c.env.DB), auth.email, auth.locale, 'reauth');
    const url = `${new URL(c.req.url).origin}/auth/reauth#token=${token}`;
    await createEmailPort(c.env).send(reauthEmail(auth.email, auth.locale, url));
    return c.json({ accepted: true as const, expiresInSeconds: MAGIC_LINK_TTL_SECONDS }, 202);
  });

  app.openapi(reauthVerifyRoute, async (c) => {
    const auth = requireAuth(c);
    const { token } = c.req.valid('json');
    const r = await verifyReauth(db(c.env.DB), token, { id: auth.sessionId, email: auth.email });
    if (!r.ok)
      throw new HTTPException(404, { message: 'This confirmation link is not valid any more.' });
    return c.json({ reauthedAt: r.reauthedAt, validUntil: r.validUntil }, 200);
  });

  app.openapi(logoutRoute, async (c) => {
    const auth = requireAuth(c);
    await revokeSession(db(c.env.DB), auth.sessionId);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ loggedOut: true as const }, 200);
  });

  app.openapi(meRoute, async (c) => {
    const auth = requireAuth(c);
    return c.json(await meResponse(c.env, auth.accountId, auth.email, auth.locale), 200);
  });

  app.openapi(updateMeRoute, async (c) => {
    const auth = requireAuth(c);
    const { locale } = c.req.valid('json');
    await db(c.env.DB).update(accounts).set({ locale }).where(eq(accounts.id, auth.accountId));
    return c.json(await meResponse(c.env, auth.accountId, auth.email, locale), 200);
  });
}

async function meResponse(
  env: AppEnv['Bindings'],
  accountId: string,
  email: string,
  locale: string,
) {
  const rows = await db(env.DB)
    .select({
      organizationId: memberships.organizationId,
      organizationName: organizations.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.accountId, accountId))
    .all();
  return {
    accountId,
    email,
    locale: locale === 'en' ? ('en' as const) : ('ko' as const),
    memberships: rows,
  };
}
