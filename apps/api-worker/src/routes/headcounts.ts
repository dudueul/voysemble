// Copyright 2026- At Day. All rights reserved.
//
// /v1/orgs/{orgId}/trips/{tripId}/headcounts (D14, D25). The leader's device owns the session;
// the server stores one idempotent copy per client id. Organizers and participating leaders may
// sync and list; travelers and guardians see nothing here (the dashboard and guardian status
// views derive from these rows in later slices).

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  HeadcountList,
  Id,
  SyncHeadcountRequest,
  SyncHeadcountResponse,
  z,
} from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { type OrgAccess, requireAuth, requireOrgRole } from '../auth/middleware';
import type { AppEnv } from '../env';
import { notificationBody, notifyTrip } from '../lib/notify';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const HeadcountParams = z.object({ orgId: Id, tripId: Id, headcountId: z.uuid() });

const syncRoute = createRoute({
  method: 'put',
  path: '/v1/orgs/{orgId}/trips/{tripId}/headcounts/{headcountId}',
  tags: ['headcounts'],
  summary: 'Sync a device head count session (idempotent by client id)',
  security: SESSION_SECURITY,
  request: {
    params: HeadcountParams,
    body: { content: { 'application/json': { schema: SyncHeadcountRequest } } },
  },
  responses: {
    200: {
      description: 'Stored or already closed.',
      content: { 'application/json': { schema: SyncHeadcountResponse } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
    500: ERROR_RESPONSES[500],
  },
});

const listRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/headcounts',
  tags: ['headcounts'],
  summary: 'Head count sessions of a trip, newest first (owner, organizer, participating leader)',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: { description: 'Sessions.', content: { 'application/json': { schema: HeadcountList } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

function isStaff(access: OrgAccess, meRole: string | undefined): boolean {
  return access.role === 'owner' || access.role === 'organizer' || meRole === 'leader';
}

export function mountHeadcountRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(syncRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, headcountId } = c.req.valid('param');
    const body = c.req.valid('json');
    const access = await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    if (!isStaff(access, me?.role)) {
      throw new HTTPException(403, {
        message: 'Only organizers and trip leaders sync head counts.',
      });
    }
    const result = await org.syncHeadcount({
      id: headcountId,
      tripId,
      groupName: body.groupName,
      openedByParticipationId: me?.id ?? null,
      openedByName: me?.displayName ?? 'Organizer',
      openedAtDevice: body.openedAtDevice,
      closedAtDevice: body.closedAtDevice,
      marks: body.marks,
    });
    if ('conflict' in result) {
      throw new HTTPException(409, { message: 'This head count id belongs to another trip.' });
    }
    // D29 (slice 052): a head-count call reaches the group's travelers and leaders at once; a
    // close that leaves people missing tells their guardians and the group's leaders.
    const trip = await org.getTrip(tripId);
    if (trip && result.opened) {
      const scope = result.session.groupName ?? 'Whole trip';
      await notifyTrip(c.env, org, orgId, trip, {
        kind: 'headcount_call',
        title: `Head count: ${scope}`,
        body: notificationBody(
          `${result.session.openedByName} is counting ${scope} now. Find your leader.`,
        ),
        refType: 'headcount',
        refId: result.session.id,
        audience: {
          roles: ['traveler', 'leader'],
          ...(result.session.groupName ? { groupNames: [result.session.groupName] } : {}),
        },
      });
    }
    if (trip && result.incidentOpened && result.incidentId) {
      const missing = result.session.missing.map((m) => m.participationId);
      await notifyTrip(c.env, org, orgId, trip, {
        kind: 'incident_status',
        title: `Missing after the head count: ${result.session.missing.map((m) => m.displayName).join(', ')}`,
        body: notificationBody(
          `${result.session.openedByName} closed the count with ${missing.length} missing. Leaders are on it.`,
        ),
        refType: 'incident',
        refId: result.incidentId,
        audience: {
          roles: ['leader'],
          ...(result.session.groupName ? { groupNames: [result.session.groupName] } : {}),
          guardiansOf: missing,
        },
      });
    }
    return c.json(result, 200);
  });

  app.openapi(listRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const access = await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    if (!isStaff(access, me?.role)) {
      throw new HTTPException(403, {
        message: 'Only organizers and trip leaders see head counts.',
      });
    }
    return c.json({ headcounts: await org.listHeadcounts(tripId) }, 200);
  });
}
