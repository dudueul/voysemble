// Copyright 2026- At Day. All rights reserved.
//
// Travel bookings (D37, slice 046): the flights, hotels and bus charters of a trip. Owners and
// organizers write; leaders read (the bus they ride, the hotel). Guardians and travelers do not:
// the itinerary carries what they need. A bus's seat count follows the roster groups it names.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  Booking,
  CreateBookingRequest,
  TravelPlan,
  UpdateBookingRequest,
} from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth, requireOrgRole } from '../auth/middleware';
import type { AppEnv } from '../env';
import { nowIso } from '../lib/time';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const BookingParams = TripParams.extend({ bookingId: z.uuid() });

const planRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/travel',
  tags: ['travel'],
  summary: 'Flights, hotels and bus charters of a trip (owner, organizer, leader)',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: {
      description: 'The plan, each list in creation order.',
      content: { 'application/json': { schema: TravelPlan } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const createRoute_ = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/travel',
  tags: ['travel'],
  summary: 'Add a flight, a hotel or a bus (owner, organizer)',
  description:
    'The body names its kind. A hotel must check out after it checks in (400). A bus names roster groups; its assigned count is the travelers and leaders in them.',
  security: SESSION_SECURITY,
  request: {
    params: TripParams,
    body: { content: { 'application/json': { schema: CreateBookingRequest } } },
  },
  responses: {
    201: { description: 'Created.', content: { 'application/json': { schema: Booking } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const updateRoute = createRoute({
  method: 'patch',
  path: '/v1/orgs/{orgId}/trips/{tripId}/travel/{bookingId}',
  tags: ['travel'],
  summary: 'Change a booking (owner, organizer); the kind must match the row (409)',
  security: SESSION_SECURITY,
  request: {
    params: BookingParams,
    body: { content: { 'application/json': { schema: UpdateBookingRequest } } },
  },
  responses: {
    200: { description: 'Updated.', content: { 'application/json': { schema: Booking } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
    500: ERROR_RESPONSES[500],
  },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/v1/orgs/{orgId}/trips/{tripId}/travel/{bookingId}',
  tags: ['travel'],
  summary: 'Remove a booking (owner, organizer)',
  security: SESSION_SECURITY,
  request: { params: BookingParams },
  responses: {
    200: {
      description: 'Removed.',
      content: {
        'application/json': { schema: z.object({ deleted: z.literal(true), bookingId: z.uuid() }) },
      },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

function checkHotelDates(checkIn: string | undefined, checkOut: string | undefined): void {
  if (checkIn && checkOut && checkOut <= checkIn) {
    throw new HTTPException(400, { message: 'Check-out must be after check-in.' });
  }
}

export function mountTravelRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(planRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'leader');
    const org = await orgObject(c.env, orgId);
    const r = await org.travelPlan(tripId);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Trip not found.' });
    return c.json(r, 200);
  });

  app.openapi(createRoute_, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const body = c.req.valid('json');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    if (body.kind === 'hotel') checkHotelDates(body.checkIn, body.checkOut);
    const org = await orgObject(c.env, orgId);
    const r = await org.createBooking(tripId, body, nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: 'Trip not found.' });
    return c.json(r, 201);
  });

  app.openapi(updateRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, bookingId } = c.req.valid('param');
    const body = c.req.valid('json');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const r = await org.updateBooking(tripId, bookingId, body);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Booking not found.' });
    if ('kindMismatch' in r)
      throw new HTTPException(409, { message: 'The booking is of another kind.' });
    if (r.kind === 'hotel') checkHotelDates(r.checkIn, r.checkOut);
    return c.json(r, 200);
  });

  app.openapi(deleteRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, bookingId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const r = await org.deleteBooking(tripId, bookingId);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Booking not found.' });
    return c.json({ deleted: true as const, bookingId }, 200);
  });
}
