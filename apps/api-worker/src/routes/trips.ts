// Copyright 2026- At Day. All rights reserved.
//
// /v1/orgs/{orgId}/trips: create (owner/organizer) and list (any member). Trips are stored in
// the organization's Durable Object; this file only authorizes and forwards.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { CreateTripRequest, Id, Trip, TripList, z } from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { requireAuth, requireOrgRole } from '../auth/middleware';
import type { AppEnv } from '../env';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';

export const OrgParams = z.object({ orgId: Id });
export const TripParams = z.object({ orgId: Id, tripId: Id });

const createTripRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips',
  tags: ['trips'],
  summary: 'Create a trip (owner or organizer)',
  security: SESSION_SECURITY,
  request: {
    params: OrgParams,
    body: { content: { 'application/json': { schema: CreateTripRequest } } },
  },
  responses: {
    201: { description: 'Created.', content: { 'application/json': { schema: Trip } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    500: ERROR_RESPONSES[500],
  },
});

const listTripsRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips',
  tags: ['trips'],
  summary: 'Trips of an organization (any member)',
  security: SESSION_SECURITY,
  request: { params: OrgParams },
  responses: {
    200: { description: 'Trips.', content: { 'application/json': { schema: TripList } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    500: ERROR_RESPONSES[500],
  },
});

function assertTimezone(tz: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw new HTTPException(400, { message: 'Unknown time zone.' });
  }
}

export function mountTripRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(createTripRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId } = c.req.valid('param');
    const body = c.req.valid('json');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    if (body.endsOn < body.startsOn) {
      throw new HTTPException(400, { message: 'endsOn must not be before startsOn.' });
    }
    assertTimezone(body.timezone);
    const org = await orgObject(c.env, orgId);
    const trip = await org.createTrip(body);
    return c.json(trip, 201);
  });

  app.openapi(listTripsRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    return c.json({ trips: await org.listTrips() }, 200);
  });
}
