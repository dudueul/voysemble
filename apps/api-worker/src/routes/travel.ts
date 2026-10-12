// Copyright 2026- At Day. All rights reserved.
//
// Travel bookings (D37, slice 046): the flights, hotels and bus charters of a trip. Owners and
// organizers write; leaders read (the bus they ride, the hotel). Guardians and travelers do not:
// the itinerary carries what they need. A bus's seat count follows the roster groups it names.
// The driver's sealed link (D27, D39, slice 049): an organizer mints a time-limited, revocable
// link to one bus's sheet (names only); the driver opens it without an account through the
// public route, which counts the open. Only the token's hash is stored; the URL is shown once.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  AssignRoomRequest,
  Booking,
  CreateBookingRequest,
  CreateDriverLinkResponse,
  CreateHotelLinkResponse,
  DriverLink,
  DriverLinkList,
  DriverSheet,
  HotelLink,
  HotelLinkList,
  HotelSheet,
  OpenDriverSheetRequest,
  OpenHotelSheetRequest,
  RoomingList,
  TravelPlan,
  UpdateBookingRequest,
} from '@voysemble/contracts';
import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth, requireOrgRole } from '../auth/middleware';
import { db } from '../db/client';
import { organizations } from '../db/schema';
import type { AppEnv } from '../env';
import { clientIp, enforceLimits } from '../lib/rate-limit';
import { isPast, nowIso, plusSeconds, SECONDS } from '../lib/time';
import { hashToken, randomToken } from '../lib/tokens';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const BookingParams = TripParams.extend({ bookingId: z.uuid() });
const LinkParams = BookingParams.extend({ linkId: z.uuid() });
const DriverParams = z.object({ orgId: z.uuid() });

/** Thirty days from now or two days after the trip ends, whichever comes first; never under a day. */
export function driverLinkExpiry(now: string, endsOn: string): string {
  const byTrip = plusSeconds(`${endsOn}T00:00:00.000Z`, 2 * SECONDS.day);
  const byNow = plusSeconds(now, 30 * SECONDS.day);
  const soonest = byTrip < byNow ? byTrip : byNow;
  return isPast(plusSeconds(soonest, -SECONDS.day), now) ? plusSeconds(now, SECONDS.day) : soonest;
}

const createLinkRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/travel/{bookingId}/driver-links',
  tags: ['travel'],
  summary: "Mint the driver's sealed link to a bus (owner, organizer); the URL is returned once",
  description:
    'The link opens the bus sheet (names only) without an account until it expires (thirty days, or two days after the trip ends) or is revoked. Only the token hash is stored.',
  security: SESSION_SECURITY,
  request: { params: BookingParams },
  responses: {
    201: {
      description: 'The link and its URL (token in the fragment).',
      content: { 'application/json': { schema: CreateDriverLinkResponse } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const listLinksRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/travel/{bookingId}/driver-links',
  tags: ['travel'],
  summary: 'The links minted for a bus with their opens (owner, organizer)',
  security: SESSION_SECURITY,
  request: { params: BookingParams },
  responses: {
    200: {
      description: 'Newest first.',
      content: { 'application/json': { schema: DriverLinkList } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const revokeLinkRoute = createRoute({
  method: 'delete',
  path: '/v1/orgs/{orgId}/trips/{tripId}/travel/{bookingId}/driver-links/{linkId}',
  tags: ['travel'],
  summary: 'Revoke a link (owner, organizer); its opens stay on record',
  security: SESSION_SECURITY,
  request: { params: LinkParams },
  responses: {
    200: { description: 'Revoked.', content: { 'application/json': { schema: DriverLink } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const openSheetRoute = createRoute({
  method: 'post',
  path: '/v1/driver/{orgId}',
  tags: ['travel'],
  summary: "Open a bus sheet with the driver's link (no account); each open is counted",
  description:
    'The token comes from the URL fragment. Unknown, expired and revoked tokens are one 404: nothing to learn. Rate limited per address.',
  request: {
    params: DriverParams,
    body: { content: { 'application/json': { schema: OpenDriverSheetRequest } } },
  },
  responses: {
    200: { description: 'The sheet.', content: { 'application/json': { schema: DriverSheet } } },
    400: ERROR_RESPONSES[400],
    404: ERROR_RESPONSES[404],
    429: ERROR_RESPONSES[429],
    500: ERROR_RESPONSES[500],
  },
});

/* ---------- Rooming lists and the hotel's sealed link (D27, D41; slice 058) ---------- */

const roomingRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/travel/{bookingId}/rooming',
  tags: ['travel'],
  summary: "A hotel's rooming list: who sleeps where (owner, organizer, leader)",
  security: SESSION_SECURITY,
  request: { params: BookingParams },
  responses: {
    200: { description: 'The list.', content: { 'application/json': { schema: RoomingList } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const assignRoomRoute = createRoute({
  method: 'put',
  path: '/v1/orgs/{orgId}/trips/{tripId}/travel/{bookingId}/rooming',
  tags: ['travel'],
  summary: 'Put one leader or traveler in a room of the hotel, or take them out (owner, organizer)',
  security: SESSION_SECURITY,
  request: {
    params: BookingParams,
    body: { content: { 'application/json': { schema: AssignRoomRequest } } },
  },
  responses: {
    200: {
      description: 'The list as it is now.',
      content: { 'application/json': { schema: RoomingList } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const createHotelLinkRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/travel/{bookingId}/hotel-links',
  tags: ['travel'],
  summary: "Mint the hotel's sealed link to a stay (owner, organizer); the URL is returned once",
  description:
    'The link opens the hotel sheet (the stay, the rooming list by room, the leaders by name) without an account until it expires (thirty days, or two days after the trip ends) or is revoked. Only the token hash is stored.',
  security: SESSION_SECURITY,
  request: { params: BookingParams },
  responses: {
    201: {
      description: 'The link and its URL (token in the fragment).',
      content: { 'application/json': { schema: CreateHotelLinkResponse } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const listHotelLinksRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/travel/{bookingId}/hotel-links',
  tags: ['travel'],
  summary: 'The links minted for a hotel with their opens (owner, organizer)',
  security: SESSION_SECURITY,
  request: { params: BookingParams },
  responses: {
    200: {
      description: 'Newest first.',
      content: { 'application/json': { schema: HotelLinkList } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const revokeHotelLinkRoute = createRoute({
  method: 'delete',
  path: '/v1/orgs/{orgId}/trips/{tripId}/travel/{bookingId}/hotel-links/{linkId}',
  tags: ['travel'],
  summary: 'Revoke a hotel link; the row and its opens stay (owner, organizer)',
  security: SESSION_SECURITY,
  request: { params: LinkParams },
  responses: {
    200: { description: 'Revoked.', content: { 'application/json': { schema: HotelLink } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const HotelParams = z.object({ orgId: z.uuid() });

const openHotelSheetRoute = createRoute({
  method: 'post',
  path: '/v1/hotel/{orgId}',
  tags: ['travel'],
  summary: "Open a hotel sheet with the hotel's link (no account); each open is counted",
  description:
    'The token comes from the URL fragment. Unknown, expired and revoked tokens are one 404: nothing to learn. Rate limited per address.',
  request: {
    params: HotelParams,
    body: { content: { 'application/json': { schema: OpenHotelSheetRequest } } },
  },
  responses: {
    200: { description: 'The sheet.', content: { 'application/json': { schema: HotelSheet } } },
    400: ERROR_RESPONSES[400],
    404: ERROR_RESPONSES[404],
    429: ERROR_RESPONSES[429],
    500: ERROR_RESPONSES[500],
  },
});

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
    const access = await requireOrgRole(c.env, auth, orgId, 'leader');
    const org = await orgObject(c.env, orgId);
    const r = await org.travelPlan(tripId);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Trip not found.' });
    // D37: the driver's contact stays on the console; a leader's phone reads the bus without it.
    if (access.role === 'leader') {
      return c.json({ ...r, buses: r.buses.map((b) => ({ ...b, driverContact: null })) }, 200);
    }
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

  app.openapi(createLinkRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, bookingId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    const trip = await org.getTrip(tripId);
    if (!trip) throw new HTTPException(404, { message: 'Trip not found.' });
    const token = randomToken();
    const now = nowIso();
    const r = await org.createDriverLink(
      tripId,
      bookingId,
      hashToken(token),
      now,
      driverLinkExpiry(now, trip.endsOn),
    );
    if ('notFound' in r) throw new HTTPException(404, { message: 'Bus not found.' });
    const url = `${new URL(c.req.url).origin}/driver/${orgId}#token=${token}`;
    return c.json({ link: r, url }, 201);
  });

  app.openapi(listLinksRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, bookingId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    const r = await org.listDriverLinks(tripId, bookingId);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Bus not found.' });
    return c.json({ links: r }, 200);
  });

  app.openapi(revokeLinkRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, linkId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    const r = await org.revokeDriverLink(tripId, linkId, nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: 'Link not found.' });
    return c.json(r, 200);
  });

  app.openapi(roomingRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, bookingId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'leader');
    const org = await orgObject(c.env, orgId);
    const r = await org.rooming(tripId, bookingId);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Hotel not found.' });
    return c.json(r, 200);
  });

  app.openapi(assignRoomRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, bookingId } = c.req.valid('param');
    const body = c.req.valid('json');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    const r = await org.assignRoom(tripId, bookingId, body.participationId, body.room, nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: 'Hotel or person not found.' });
    if ('notAPerson' in r) {
      throw new HTTPException(400, { message: 'Only leaders and travelers sleep at the hotel.' });
    }
    return c.json(r, 200);
  });

  app.openapi(createHotelLinkRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, bookingId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    const trip = await org.getTrip(tripId);
    if (!trip) throw new HTTPException(404, { message: 'Trip not found.' });
    const token = randomToken();
    const now = nowIso();
    const r = await org.createHotelLink(
      tripId,
      bookingId,
      hashToken(token),
      now,
      driverLinkExpiry(now, trip.endsOn),
    );
    if ('notFound' in r) throw new HTTPException(404, { message: 'Hotel not found.' });
    const url = `${new URL(c.req.url).origin}/hotel/${orgId}#token=${token}`;
    return c.json({ link: r, url }, 201);
  });

  app.openapi(listHotelLinksRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, bookingId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    const r = await org.listHotelLinks(tripId, bookingId);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Hotel not found.' });
    return c.json({ links: r }, 200);
  });

  app.openapi(revokeHotelLinkRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, linkId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    const r = await org.revokeHotelLink(tripId, linkId, nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: 'Link not found.' });
    return c.json(r, 200);
  });

  app.openapi(openHotelSheetRoute, async (c) => {
    await enforceLimits(c, [{ scope: 'hotelIp', subject: clientIp(c) }]);
    const { orgId } = c.req.valid('param');
    const { token } = c.req.valid('json');
    const organization = await db(c.env.DB)
      .select({ name: organizations.name, status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .get();
    if (organization?.status !== 'active') {
      throw new HTTPException(404, { message: NOT_VALID_LINK });
    }
    const org = await orgObject(c.env, orgId);
    const r = await org.openHotelSheet(hashToken(token), nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: NOT_VALID_LINK });
    c.header('Cache-Control', 'no-store');
    return c.json({ ...r, organizationName: organization.name }, 200);
  });

  app.openapi(openSheetRoute, async (c) => {
    await enforceLimits(c, [{ scope: 'driverIp', subject: clientIp(c) }]);
    const { orgId } = c.req.valid('param');
    const { token } = c.req.valid('json');
    const organization = await db(c.env.DB)
      .select({ name: organizations.name, status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .get();
    if (organization?.status !== 'active') {
      throw new HTTPException(404, { message: NOT_VALID_LINK });
    }
    const org = await orgObject(c.env, orgId);
    const r = await org.openDriverSheet(hashToken(token), nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: NOT_VALID_LINK });
    c.header('Cache-Control', 'no-store');
    return c.json({ ...r, organizationName: organization.name }, 200);
  });
}

const NOT_VALID_LINK = 'This link no longer works. Ask the organizer for a new one.';
