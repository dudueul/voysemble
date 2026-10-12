// Copyright 2026- At Day. All rights reserved.
//
// Notification lanes (D29, slice 052): a participant reads their own inbox and marks a row read;
// owners, organizers and leaders read the trip's log (what went out, in which lane, what waits
// for quiet hours). The events themselves are raised by the announcement, head-count, incident
// and proposal routes through lib/notify.ts.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { MyNotifications, Notification, NotificationLog } from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth, requireOrgRole } from '../auth/middleware';
import type { AppEnv } from '../env';
import { nowIso } from '../lib/time';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const NotificationParams = TripParams.extend({ notificationId: z.uuid() });

const mineRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/notifications/mine',
  tags: ['notifications'],
  summary: 'My inbox: what the lanes have delivered to me so far, newest first (any participant)',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: {
      description: 'The inbox.',
      content: { 'application/json': { schema: MyNotifications } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const readRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/notifications/{notificationId}/read',
  tags: ['notifications'],
  summary: 'Mark one of my notifications read',
  security: SESSION_SECURITY,
  request: { params: NotificationParams },
  responses: {
    200: { description: 'The row.', content: { 'application/json': { schema: Notification } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const logRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/notifications',
  tags: ['notifications'],
  summary: 'The log of what went out: events with their lane counts (owner, organizer, leader)',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: {
      description: 'Newest first, fifty events.',
      content: { 'application/json': { schema: NotificationLog } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

export function mountNotificationRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(mineRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    if (!me) throw new HTTPException(403, { message: 'Only a trip participant has an inbox.' });
    return c.json(await org.myNotifications(tripId, me.id, nowIso()), 200);
  });

  app.openapi(readRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, notificationId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    if (!me) throw new HTTPException(403, { message: 'Only a trip participant has an inbox.' });
    const r = await org.markNotificationRead(tripId, me.id, notificationId, nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: 'Notification not found.' });
    return c.json(r, 200);
  });

  app.openapi(logRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'leader');
    const org = await orgObject(c.env, orgId);
    const r = await org.notificationLog(tripId, nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: 'Trip not found.' });
    return c.json(r, 200);
  });
}
