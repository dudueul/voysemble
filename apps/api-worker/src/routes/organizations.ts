// Copyright 2026- At Day. All rights reserved.
//
// /v1/orgs: create (caller becomes owner) and list the caller's organizations. Organization
// rows live in D1 (directory); the OrgDurableObject is bound on creation. Slice 036 adds the
// profile with its settings (read by any member, written by the owner) and the member list
// (owner, organizer): the Settings page's facts.

import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CreateOrganizationRequest,
  Id,
  Organization,
  OrganizationList,
  OrganizationProfile,
  OrgMemberList,
  type OrgRole,
  UpdateOrganizationRequest,
} from '@voysemble/contracts';
import { asc, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { requireAuth, requireOrgRole } from '../auth/middleware';
import { db } from '../db/client';
import { accounts, memberships, organizations } from '../db/schema';
import type { AppEnv } from '../env';
import { nowIso } from '../lib/time';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';

const OrgParams = z.object({ orgId: Id });

const getRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}',
  tags: ['organizations'],
  summary: 'The organization with its settings and the caller role',
  security: SESSION_SECURITY,
  request: { params: OrgParams },
  responses: {
    200: {
      description: 'Profile.',
      content: { 'application/json': { schema: OrganizationProfile } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    500: ERROR_RESPONSES[500],
  },
});

const updateRoute = createRoute({
  method: 'patch',
  path: '/v1/orgs/{orgId}',
  tags: ['organizations'],
  summary: 'Change the name, default language or settings (owner)',
  description:
    'Owner only. Any subset; absent fields stay. The time zone must be an IANA zone (400 otherwise). Quiet hours and the guardian digest hour are HH:mm in that zone (D29); the wrap-up window is 30 to 365 days (D20).',
  security: SESSION_SECURITY,
  request: {
    params: OrgParams,
    body: { content: { 'application/json': { schema: UpdateOrganizationRequest } } },
  },
  responses: {
    200: {
      description: 'The profile after the change.',
      content: { 'application/json': { schema: OrganizationProfile } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    500: ERROR_RESPONSES[500],
  },
});

const membersRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/members',
  tags: ['organizations'],
  summary: 'Accounts in the organization with their roles (owner, organizer)',
  security: SESSION_SECURITY,
  request: { params: OrgParams },
  responses: {
    200: {
      description: 'Owners first, then organizers, leaders, members; oldest first within a role.',
      content: { 'application/json': { schema: OrgMemberList } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    500: ERROR_RESPONSES[500],
  },
});

const ROLE_ORDER: Record<OrgRole, number> = { owner: 0, organizer: 1, leader: 2, member: 3 };

function assertTimezone(tz: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw new HTTPException(400, { message: 'Unknown time zone.' });
  }
}

type OrgRow = typeof organizations.$inferSelect;

function profileOf(row: OrgRow, role: OrgRole) {
  return {
    id: row.id,
    name: row.name,
    defaultLocale: row.defaultLocale === 'en' ? ('en' as const) : ('ko' as const),
    createdAt: row.createdAt,
    role,
    settings: {
      timeZone: row.timeZone,
      quietHours: { from: row.quietFrom, to: row.quietTo },
      guardianDigestAt: row.digestAt,
      wrapUpDays: row.wrapUpDays,
    },
  };
}

const createRoute_ = createRoute({
  method: 'post',
  path: '/v1/orgs',
  tags: ['organizations'],
  summary: 'Create an organization; the caller becomes its owner',
  security: SESSION_SECURITY,
  request: { body: { content: { 'application/json': { schema: CreateOrganizationRequest } } } },
  responses: {
    201: {
      description: 'Created.',
      content: { 'application/json': { schema: Organization } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    500: ERROR_RESPONSES[500],
  },
});

const listRoute = createRoute({
  method: 'get',
  path: '/v1/orgs',
  tags: ['organizations'],
  summary: 'Organizations the caller belongs to',
  security: SESSION_SECURITY,
  responses: {
    200: {
      description: 'Memberships as organizations with the caller role.',
      content: { 'application/json': { schema: OrganizationList } },
    },
    401: ERROR_RESPONSES[401],
    500: ERROR_RESPONSES[500],
  },
});

export function mountOrganizationRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(getRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId } = c.req.valid('param');
    const access = await requireOrgRole(c.env, auth, orgId, 'member');
    const row = await db(c.env.DB)
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .get();
    if (!row) throw new HTTPException(403, { message: 'No access to this organization.' });
    return c.json(profileOf(row, access.role), 200);
  });

  app.openapi(updateRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId } = c.req.valid('param');
    const body = c.req.valid('json');
    const access = await requireOrgRole(c.env, auth, orgId, 'owner');
    if (body.settings?.timeZone !== undefined) assertTimezone(body.settings.timeZone);
    const d = db(c.env.DB);
    const patch: Partial<OrgRow> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.defaultLocale !== undefined) patch.defaultLocale = body.defaultLocale;
    const st = body.settings;
    if (st?.timeZone !== undefined) patch.timeZone = st.timeZone;
    if (st?.quietHours !== undefined) {
      patch.quietFrom = st.quietHours.from;
      patch.quietTo = st.quietHours.to;
    }
    if (st?.guardianDigestAt !== undefined) patch.digestAt = st.guardianDigestAt;
    if (st?.wrapUpDays !== undefined) patch.wrapUpDays = st.wrapUpDays;
    if (Object.keys(patch).length > 0) {
      await d.update(organizations).set(patch).where(eq(organizations.id, orgId));
    }
    const row = await d.select().from(organizations).where(eq(organizations.id, orgId)).get();
    if (!row) throw new HTTPException(403, { message: 'No access to this organization.' });
    return c.json(profileOf(row, access.role), 200);
  });

  app.openapi(membersRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const rows = await db(c.env.DB)
      .select({
        accountId: memberships.accountId,
        email: accounts.email,
        role: memberships.role,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(accounts, eq(accounts.id, memberships.accountId))
      .where(eq(memberships.organizationId, orgId))
      .orderBy(asc(memberships.createdAt))
      .all();
    const members = rows
      .map((r) => ({ ...r, you: r.accountId === auth.accountId }))
      .sort(
        (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joinedAt.localeCompare(b.joinedAt),
      );
    return c.json({ members }, 200);
  });

  app.openapi(createRoute_, async (c) => {
    const auth = requireAuth(c);
    const { name, defaultLocale } = c.req.valid('json');
    const d = db(c.env.DB);
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    await d.batch([
      d
        .insert(organizations)
        .values({ id, name, defaultLocale, createdBy: auth.accountId, createdAt }),
      d.insert(memberships).values({
        id: crypto.randomUUID(),
        accountId: auth.accountId,
        organizationId: id,
        role: 'owner',
        createdAt,
      }),
    ]);
    await orgObject(c.env, id);
    return c.json({ id, name, defaultLocale, createdAt, role: 'owner' as const }, 201);
  });

  app.openapi(listRoute, async (c) => {
    const auth = requireAuth(c);
    const rows = await db(c.env.DB)
      .select({
        id: organizations.id,
        name: organizations.name,
        defaultLocale: organizations.defaultLocale,
        createdAt: organizations.createdAt,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(eq(memberships.accountId, auth.accountId))
      .all();
    return c.json(
      {
        organizations: rows.map((r) => ({
          ...r,
          defaultLocale: r.defaultLocale === 'en' ? ('en' as const) : ('ko' as const),
        })),
      },
      200,
    );
  });
}
