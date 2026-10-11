// Copyright 2026- At Day. All rights reserved.
//
// /v1/orgs/{orgId}/trips/{tripId}/incidents (D17, D25). Cards are auto-created by the head count
// sync; staff list and resolve them, a leader (or organizer) confirms what they see, and the
// organizer sends the guardian status message composed from the latest confirmation. Guardians
// list only the cards about their own traveler, projected to status plus message; travelers see
// nothing here.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  ConfirmIncidentRequest,
  Id,
  Incident,
  IncidentList,
  ResolveIncidentRequest,
  z,
} from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { type OrgAccess, requireAuth, requireOrgRole } from '../auth/middleware';
import type { AppEnv } from '../env';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const IncidentParams = z.object({ orgId: Id, tripId: Id, incidentId: z.uuid() });

const listRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/incidents',
  tags: ['incidents'],
  summary: 'Incident cards of a trip, open first (owner, organizer, participating leader)',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: { description: 'Cards.', content: { 'application/json': { schema: IncidentList } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const resolveRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/incidents/{incidentId}/resolve',
  tags: ['incidents'],
  summary: 'Resolve an incident card with an optional note',
  security: SESSION_SECURITY,
  request: {
    params: IncidentParams,
    body: { content: { 'application/json': { schema: ResolveIncidentRequest } } },
  },
  responses: {
    200: { description: 'Resolved.', content: { 'application/json': { schema: Incident } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
    500: ERROR_RESPONSES[500],
  },
});

const confirmRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/incidents/{incidentId}/confirm',
  tags: ['incidents'],
  summary:
    'Record what a leader (or organizer) sees right now: with group, not with group, unknown',
  security: SESSION_SECURITY,
  request: {
    params: IncidentParams,
    body: { content: { 'application/json': { schema: ConfirmIncidentRequest } } },
  },
  responses: {
    200: { description: 'Recorded.', content: { 'application/json': { schema: Incident } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
    500: ERROR_RESPONSES[500],
  },
});

const guardianMessageRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/incidents/{incidentId}/guardian-message',
  tags: ['incidents'],
  summary:
    'Compose and send the guardian status message from the latest confirmation (owner, organizer)',
  security: SESSION_SECURITY,
  request: { params: IncidentParams },
  responses: {
    200: { description: 'Sent.', content: { 'application/json': { schema: Incident } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
    500: ERROR_RESPONSES[500],
  },
});

function isStaff(access: OrgAccess, meRole: string | undefined): boolean {
  return access.role === 'owner' || access.role === 'organizer' || meRole === 'leader';
}

export function mountIncidentRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const access = await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    if (!isStaff(access, me?.role) && me?.role !== 'guardian') {
      throw new HTTPException(403, { message: 'Only organizers and trip leaders see incidents.' });
    }
    return c.json({ incidents: await org.listIncidents(tripId, me) }, 200);
  });

  app.openapi(confirmRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, incidentId } = c.req.valid('param');
    const body = c.req.valid('json');
    const access = await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    if (!isStaff(access, me?.role)) {
      throw new HTTPException(403, {
        message: 'Only trip leaders and organizers confirm incidents.',
      });
    }
    const result = await org.confirmIncident({
      tripId,
      incidentId,
      status: body.status,
      note: body.note,
      byParticipationId: me?.id ?? null,
      byName: me?.displayName ?? 'Organizer',
      byRole: me?.role === 'leader' ? 'leader' : 'organizer',
    });
    if ('notFound' in result) throw new HTTPException(404, { message: 'Incident not found.' });
    if ('resolved' in result) {
      throw new HTTPException(409, { message: 'This incident is already resolved.' });
    }
    return c.json(result.incident, 200);
  });

  app.openapi(guardianMessageRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, incidentId } = c.req.valid('param');
    const access = await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    const result = await org.sendGuardianMessage({
      tripId,
      incidentId,
      byName: me?.displayName ?? (access.role === 'owner' ? 'Organizer' : 'Organizer'),
    });
    if ('notFound' in result) throw new HTTPException(404, { message: 'Incident not found.' });
    if ('noConfirmation' in result) {
      throw new HTTPException(409, {
        message: 'Ask a leader to confirm first; the message names the confirming leader.',
      });
    }
    return c.json(result.incident, 200);
  });

  app.openapi(resolveRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, incidentId } = c.req.valid('param');
    const body = c.req.valid('json');
    const access = await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    if (!isStaff(access, me?.role)) {
      throw new HTTPException(403, {
        message: 'Only organizers and trip leaders resolve incidents.',
      });
    }
    const result = await org.resolveIncident({
      tripId,
      incidentId,
      byName: me?.displayName ?? 'Organizer',
      note: body.note,
    });
    if ('notFound' in result) throw new HTTPException(404, { message: 'Incident not found.' });
    if ('alreadyResolved' in result) {
      throw new HTTPException(409, { message: 'This incident is already resolved.' });
    }
    return c.json(result.incident, 200);
  });
}
