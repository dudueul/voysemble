// Copyright 2026- At Day. All rights reserved.
//
// Care notes (D27, slice 030). Who may do what, per ADR-0009:
// - status (is there a note, who set it, how many reveals): staff, the traveler, their guardians;
// - write: owner, organizer, or a guardian bound to the traveler (guardians enter it);
// - reveal (decrypt, audited): owner, organizer, a leader of the traveler's group (a leader
//   without a group covers the whole trip), the traveler, their guardians.
// The content never appears in a list; it leaves the object only on a reveal.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  CareNote,
  CareNoteStatus,
  type Participation,
  RevealCareNoteResponse,
} from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { organizerName, requireAuth, requireOrgRole } from '../auth/middleware';
import type { AppEnv } from '../env';
import { nowIso } from '../lib/time';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const CareParams = TripParams.extend({ participationId: z.uuid() });

const statusRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/people/{participationId}/care-note',
  tags: ['people'],
  summary: 'Whether a care note is on file for a traveler, who set it, and how many reveals',
  description:
    'Owner, organizer, a leader participating in the trip, the traveler, or a guardian bound to the traveler. Never the content.',
  security: SESSION_SECURITY,
  request: { params: CareParams },
  responses: {
    200: { description: 'Status.', content: { 'application/json': { schema: CareNoteStatus } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const putRoute = createRoute({
  method: 'put',
  path: '/v1/orgs/{orgId}/trips/{tripId}/people/{participationId}/care-note',
  tags: ['people'],
  summary: 'Set or clear a traveler care note (sealed at rest)',
  description:
    'Owner, organizer, or a guardian bound to the traveler. An all-blank note clears the row. 503 when the deployment has no CARE_NOTE_KEY.',
  security: SESSION_SECURITY,
  request: { params: CareParams, body: { content: { 'application/json': { schema: CareNote } } } },
  responses: {
    200: {
      description: 'Status after the write.',
      content: { 'application/json': { schema: CareNoteStatus } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
    503: ERROR_RESPONSES[500],
  },
});

const revealRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/people/{participationId}/care-note/reveal',
  tags: ['people'],
  summary: 'Reveal a traveler care note (decrypts; every reveal is audited on the timeline)',
  description:
    "Owner, organizer, a leader of the traveler's group, the traveler, or a guardian bound to the traveler. 404 NO_CARE_NOTE when nothing is on file.",
  security: SESSION_SECURITY,
  request: { params: CareParams },
  responses: {
    200: {
      description: 'The note and the audit instant.',
      content: { 'application/json': { schema: RevealCareNoteResponse } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
    503: ERROR_RESPONSES[500],
  },
});

type Who = {
  staff: boolean;
  organizer: boolean;
  leaderOfGroup: boolean;
  self: boolean;
  guardian: boolean;
  by: { name: string; role: string };
};

export function mountCareRoutes(app: OpenAPIHono<AppEnv>): void {
  async function resolve(
    c: Parameters<Parameters<typeof app.openapi>[1]>[0],
    orgId: string,
    tripId: string,
    participationId: string,
  ): Promise<{ org: Awaited<ReturnType<typeof orgObject>>; who: Who }> {
    const auth = requireAuth(c);
    const access = await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const target = await org.getParticipation(participationId);
    if (!target || target.tripId !== tripId || target.role !== 'traveler')
      throw new HTTPException(404, { message: 'Traveler not found.' });
    const me: Participation | null = await org.participationForAccount(tripId, auth.accountId);
    const organizer = access.role === 'owner' || access.role === 'organizer';
    const leader = me?.role === 'leader';
    const who: Who = {
      staff: organizer || leader,
      organizer,
      leaderOfGroup: leader && (me?.groupName === null || me?.groupName === target.groupName),
      self: me?.id === target.id,
      guardian: me?.role === 'guardian' && me.guardianOf === target.id,
      by: {
        name: me?.displayName ?? organizerName(auth, access),
        role: me?.role ?? access.role,
      },
    };
    return { org, who };
  }

  app.openapi(statusRoute, async (c) => {
    const { orgId, tripId, participationId } = c.req.valid('param');
    const { org, who } = await resolve(c, orgId, tripId, participationId);
    if (!(who.staff || who.self || who.guardian))
      throw new HTTPException(403, { message: 'Not your traveler.' });
    const r = await org.careNoteStatus(tripId, participationId);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Traveler not found.' });
    return c.json(r, 200);
  });

  app.openapi(putRoute, async (c) => {
    const { orgId, tripId, participationId } = c.req.valid('param');
    const { org, who } = await resolve(c, orgId, tripId, participationId);
    if (!(who.organizer || who.guardian))
      throw new HTTPException(403, {
        message: 'Only the organizer or a bound guardian writes a care note.',
      });
    const r = await org.putCareNote(tripId, participationId, c.req.valid('json'), who.by, nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: 'Traveler not found.' });
    if ('notConfigured' in r)
      throw new HTTPException(503, {
        message: 'Care notes are not configured for this deployment.',
      });
    return c.json(r, 200);
  });

  app.openapi(revealRoute, async (c) => {
    const { orgId, tripId, participationId } = c.req.valid('param');
    const { org, who } = await resolve(c, orgId, tripId, participationId);
    if (!(who.organizer || who.leaderOfGroup || who.self || who.guardian))
      throw new HTTPException(403, { message: 'Not your traveler.' });
    const r = await org.revealCareNote(tripId, participationId, who.by, nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: 'Traveler not found.' });
    if ('none' in r) throw new HTTPException(404, { message: 'No care note on file.' });
    if ('notConfigured' in r)
      throw new HTTPException(503, {
        message: 'Care notes are not configured for this deployment.',
      });
    return c.json(r, 200);
  });
}
