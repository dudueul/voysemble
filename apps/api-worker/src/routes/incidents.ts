// Copyright 2026- At Day. All rights reserved.
//
// /v1/orgs/{orgId}/trips/{tripId}/incidents (D17, D25). Cards are auto-created by the head count
// sync; staff list and resolve them, a leader (or organizer) confirms what they see, and the
// organizer sends the guardian status message composed from the latest confirmation. Guardians
// list only the cards about their own traveler, projected to status plus message; travelers
// (slice 074) the cards naming themselves, projected further. Slice 068: the organizer also opens
// a card by hand, naming travelers; the guardians of those travelers and the leaders of their
// groups hear it at once. Slice 073: a leader opens one for their group. Slice 074: a traveler
// asks for help for themselves from Today (kind `help`); their leaders and guardians hear it.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  ConfirmIncidentRequest,
  Id,
  Incident,
  IncidentList,
  OpenIncidentRequest,
  ResolveIncidentRequest,
  z,
} from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { type OrgAccess, organizerName, requireAuth, requireOrgRole } from '../auth/middleware';
import type { AppEnv } from '../env';
import { notificationBody, notifyTrip } from '../lib/notify';
import { nowIso } from '../lib/time';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const IncidentParams = z.object({ orgId: Id, tripId: Id, incidentId: z.uuid() });

const openRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/incidents',
  tags: ['incidents'],
  summary:
    'Open an incident card by hand, naming travelers (owner, organizer, a leader for their group, a traveler for themselves)',
  description:
    'Slice 068 (D17). For anything the head count did not catch: a lost passport, a sick traveler. The card is open, kind `manual`, opened by the organizer; the leaders of the named travelers\' groups and their guardians hear "Incident opened" at once; the rest of the flow is the head count card\'s (a leader confirms, the organizer sends the guardian message, resolves). A guardian, a leader or an unknown id is 404. Slice 073: a trip leader opens one from the phone too, naming travelers of their group only (a whole-trip leader any traveler); the card is opened by their name. Slice 074: a traveler opens one for themselves from Today ("I need help"): kind `help`, naming only themselves (403 otherwise), opened by their name; the leaders of their group and their guardians hear "Help asked: <name>".',
  security: SESSION_SECURITY,
  request: {
    params: TripParams,
    body: { content: { 'application/json': { schema: OpenIncidentRequest } } },
  },
  responses: {
    201: { description: 'The card.', content: { 'application/json': { schema: Incident } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const listRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/incidents',
  tags: ['incidents'],
  summary:
    'Incident cards of a trip, open first (owner, organizer, participating leader; a guardian and a traveler get the cards naming their traveler or themselves, projected)',
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
    if (!isStaff(access, me?.role) && me?.role !== 'guardian' && me?.role !== 'traveler') {
      throw new HTTPException(403, {
        message: 'Only organizers and people on the trip see incidents.',
      });
    }
    return c.json({ incidents: await org.listIncidents(tripId, me) }, 200);
  });

  app.openapi(openRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const body = c.req.valid('json');
    const access = await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    const traveler = me?.role === 'traveler';
    if (!isStaff(access, me?.role) && !traveler) {
      throw new HTTPException(403, {
        message: 'Only organizers, trip leaders and travelers open incidents.',
      });
    }
    // Slice 074: a traveler asks for help for themselves only.
    const myId = me?.id;
    if (traveler && body.participationIds.some((id) => id !== myId)) {
      throw new HTTPException(403, { message: 'A traveler asks for help for themselves only.' });
    }
    // Slice 073: a leader names travelers of their own group (a whole-trip leader any traveler).
    if (me?.role === 'leader' && me.groupName !== null) {
      const roster = await org.listRoster(tripId);
      const outside = body.participationIds.find(
        (id) => roster.find((p) => p.id === id)?.groupName !== me.groupName,
      );
      if (outside) {
        throw new HTTPException(403, { message: 'A leader names travelers of their own group.' });
      }
    }
    const byName = me?.displayName ?? organizerName(auth, access);
    const r = await org.openManualIncident({
      tripId,
      kind: traveler ? 'help' : 'manual',
      title: body.title,
      participationIds: body.participationIds,
      byName,
      now: nowIso(),
    });
    if ('notFound' in r) throw new HTTPException(404, { message: 'Trip not found.' });
    if ('notATraveler' in r) {
      throw new HTTPException(404, {
        message: 'Every person named must be a traveler of this trip.',
      });
    }
    await notifyIncidentStatus(c.env, org, orgId, tripId, r.incident, 'opened', byName);
    return c.json(r.incident, 201);
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
    await notifyIncidentStatus(
      c.env,
      org,
      orgId,
      tripId,
      result.incident,
      body.status,
      me?.displayName ?? 'Organizer',
    );
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
    await notifyIncidentStatus(
      c.env,
      org,
      orgId,
      tripId,
      result.incident,
      'resolved',
      me?.displayName ?? 'Organizer',
    );
    return c.json(result.incident, 200);
  });
}

/** D29 (slice 052): an incident's status reaches the guardians of the people on it and the leaders of their groups, at once. */
async function notifyIncidentStatus(
  env: Env,
  org: Awaited<ReturnType<typeof orgObject>>,
  orgId: string,
  tripId: string,
  incident: Incident,
  status: string,
  byName: string,
): Promise<void> {
  const trip = await org.getTrip(tripId);
  if (!trip) return;
  const names = incident.people.map((p) => p.displayName).join(', ');
  const groups = [
    ...new Set(incident.people.map((p) => p.groupName).filter((g): g is string => g !== null)),
  ];
  // Slice 074: a traveler's own request reads "Help asked", not "Incident opened".
  const line = status === 'opened' && incident.kind === 'help' ? 'Help asked' : statusLine(status);
  await notifyTrip(env, org, orgId, trip, {
    kind: 'incident_status',
    title: `${line}: ${names}`,
    body: notificationBody(`${byName}: ${incident.title}`),
    refType: 'incident',
    refId: incident.id,
    audience: {
      roles: ['leader'],
      ...(groups.length > 0 ? { groupNames: groups } : {}),
      guardiansOf: incident.people.map((p) => p.participationId),
    },
  });
}

/** The confirmation statuses (D17) and the resolution as a notification title's first words. */
function statusLine(status: string): string {
  switch (status) {
    case 'with_group':
      return 'With the group';
    case 'not_with_group':
      return 'Not with the group';
    case 'unknown':
      return 'Still unknown';
    case 'resolved':
      return 'Resolved';
    case 'opened':
      return 'Incident opened';
    default:
      return `Incident: ${status}`;
  }
}
