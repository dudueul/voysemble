// Copyright 2026- At Day. All rights reserved.
//
// Trip report (slice 034): owner or organizer. Composed on request from the organization's
// Durable Object lists; nothing is stored for it.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { TripReport } from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { requireAuth, requireOrgRole } from '../auth/middleware';
import type { AppEnv } from '../env';
import { buildTripReport } from '../lib/report';
import { nowIso } from '../lib/time';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const reportRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/report',
  tags: ['reports'],
  summary: 'The trip report: acknowledgments, head counts, incidents, fees, per day and overall',
  description:
    'Owner or organizer. Derived from the facts the service holds; days count from the trip start in the trip time zone. `missingNow` is the Safety list (D25): per group, the latest closed head count that left travelers missing.',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: { description: 'Report.', content: { 'application/json': { schema: TripReport } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

export function mountReportRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(reportRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    const trip = await org.getTrip(tripId);
    if (!trip) throw new HTTPException(404, { message: 'Trip not found.' });
    const [announcements, headcounts, incidents, fees, documents] = await Promise.all([
      org.listAnnouncements(tripId, null),
      org.listHeadcounts(tripId),
      org.listIncidents(tripId),
      org.listFees(tripId),
      org.documentSummary(tripId),
    ]);
    return c.json(
      buildTripReport({
        trip,
        announcements,
        headcounts,
        incidents,
        fees,
        documents,
        now: nowIso(),
      }),
      200,
    );
  });
}
