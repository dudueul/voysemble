// Copyright 2026- At Day. All rights reserved.
//
// /v1/orgs: create (caller becomes owner) and list the caller's organizations. Organization
// rows live in D1 (directory); the OrgDurableObject is bound on creation.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { CreateOrganizationRequest, Organization, OrganizationList } from '@voysemble/contracts';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware';
import { db } from '../db/client';
import { memberships, organizations } from '../db/schema';
import type { AppEnv } from '../env';
import { nowIso } from '../lib/time';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';

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
