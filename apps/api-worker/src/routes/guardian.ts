// Copyright 2026- At Day. All rights reserved.
//
// The guardian's status route (D13, slice 025). Only a guardian participation of the trip may
// call it, and it answers only about the traveler that guardian is bound to. Organizers and
// leaders have the console and the leader screens; travelers have Today. Status, never
// coordinates (D15): nothing here comes from a meeting window.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { GuardianStatus } from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { requireAuth, requireOrgRole } from '../auth/middleware';
import type { AppEnv } from '../env';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const statusRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/guardian/status',
  tags: ['guardian'],
  summary: "A guardian's view of their traveler: head count result, incident message, revision",
  description:
    "For the calling guardian participation only (403 otherwise). The traveler's mark on the latest head count that covered them, the latest incident naming them with the guardian message once sent, and the published itinerary revision. No coordinates, no other names.",
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: { description: 'Status.', content: { 'application/json': { schema: GuardianStatus } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

export function mountGuardianRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(statusRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    if (me?.role !== 'guardian') {
      throw new HTTPException(403, { message: "Only a traveler's guardian sees this status." });
    }
    const status = await org.guardianStatus(tripId, me.id);
    if (!status)
      throw new HTTPException(404, { message: 'No traveler is bound to this guardian.' });
    return c.json(status, 200);
  });
}
