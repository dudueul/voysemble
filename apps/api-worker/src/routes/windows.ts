// Copyright 2026- At Day. All rights reserved.
//
// Meeting window routes (D15, slice 029). Staff (owner, organizer, participating leader) open,
// list with every member and close; travelers and leaders report their own state and list with
// only their own row; guardians get 403 on everything (D13). "Now" is the Worker's clock, so
// the auto-stop never depends on a device.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  MeetingWindow,
  OpenWindowRequest,
  ReportWindowStateRequest,
  ReportWindowStateResponse,
  WindowList,
} from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth, requireOrgRole } from '../auth/middleware';
import type { AppEnv } from '../env';
import { nowIso } from '../lib/time';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const WindowParams = TripParams.extend({ windowId: z.uuid() });

const listRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/windows',
  tags: ['windows'],
  summary:
    'Meeting windows of a trip, newest first (staff: every member; travelers: own row; guardians: 403)',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: { description: 'Windows.', content: { 'application/json': { schema: WindowList } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const openRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/windows',
  tags: ['windows'],
  summary: 'Open a meeting window (owner, organizer, participating leader)',
  description:
    'The meeting point is kept only while the window is open and erased at close; member devices judge inside/outside themselves and report only the state.',
  security: SESSION_SECURITY,
  request: {
    params: TripParams,
    body: { content: { 'application/json': { schema: OpenWindowRequest } } },
  },
  responses: {
    201: { description: 'The window.', content: { 'application/json': { schema: MeetingWindow } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const closeRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/windows/{windowId}/close',
  tags: ['windows'],
  summary: 'Close a window early (staff); the meeting point is erased',
  security: SESSION_SECURITY,
  request: { params: WindowParams },
  responses: {
    200: {
      description: 'The closed window.',
      content: { 'application/json': { schema: MeetingWindow } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const reportRoute = createRoute({
  method: 'put',
  path: '/v1/orgs/{orgId}/trips/{tripId}/windows/{windowId}/me',
  tags: ['windows'],
  summary: "Report the caller's own state for a window (opted_out, inside, outside, uncertain)",
  security: SESSION_SECURITY,
  request: {
    params: WindowParams,
    body: { content: { 'application/json': { schema: ReportWindowStateRequest } } },
  },
  responses: {
    200: {
      description: 'Stored state.',
      content: { 'application/json': { schema: ReportWindowStateResponse } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
    500: ERROR_RESPONSES[500],
  },
});

export function mountWindowRoutes(app: OpenAPIHono<AppEnv>): void {
  const resolve = async (
    c: Parameters<Parameters<typeof app.openapi>[1]>[0],
    orgId: string,
    tripId: string,
  ) => {
    const auth = requireAuth(c);
    const access = await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    if (me?.role === 'guardian')
      throw new HTTPException(403, { message: 'Guardians never see meeting windows.' });
    const staff = access.role === 'owner' || access.role === 'organizer' || me?.role === 'leader';
    if (!staff && !me) throw new HTTPException(403, { message: 'Not on this trip.' });
    return {
      org,
      me,
      staff,
      byName: me?.displayName ?? (access.role === 'owner' ? 'Owner' : 'Organizer'),
    };
  };

  app.openapi(listRoute, async (c) => {
    const { orgId, tripId } = c.req.valid('param');
    const { org, me, staff } = await resolve(c, orgId, tripId);
    const windows = await org.listWindows(
      tripId,
      { staff, participationId: me?.id ?? null },
      nowIso(),
    );
    return c.json({ windows }, 200);
  });

  app.openapi(openRoute, async (c) => {
    const { orgId, tripId } = c.req.valid('param');
    const { org, me, staff, byName } = await resolve(c, orgId, tripId);
    if (!staff)
      throw new HTTPException(403, { message: 'Only leaders and organizers open windows.' });
    const r = await org.openWindow(
      tripId,
      c.req.valid('json'),
      { participationId: me?.id ?? null, name: byName },
      nowIso(),
    );
    if ('invalid' in r) throw new HTTPException(400, { message: r.invalid });
    return c.json(r, 201);
  });

  app.openapi(closeRoute, async (c) => {
    const { orgId, tripId, windowId } = c.req.valid('param');
    const { org, staff } = await resolve(c, orgId, tripId);
    if (!staff)
      throw new HTTPException(403, { message: 'Only leaders and organizers close windows.' });
    const r = await org.closeWindow(tripId, windowId, nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: 'Window not found.' });
    return c.json(r, 200);
  });

  app.openapi(reportRoute, async (c) => {
    const { orgId, tripId, windowId } = c.req.valid('param');
    const { org, me } = await resolve(c, orgId, tripId);
    if (!me) throw new HTTPException(403, { message: 'Only people on the trip report a state.' });
    const r = await org.reportWindowState(
      tripId,
      windowId,
      me.id,
      c.req.valid('json').state,
      nowIso(),
    );
    if ('notFound' in r) throw new HTTPException(404, { message: 'Window not found.' });
    if ('notMember' in r)
      throw new HTTPException(403, { message: 'This window does not include you.' });
    if ('closed' in r) throw new HTTPException(409, { message: 'The window is closed.' });
    return c.json(r, 200);
  });
}
