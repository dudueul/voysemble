// Copyright 2026- At Day. All rights reserved.
//
// /v1/orgs/{orgId}/trips/{tripId}/itinerary (D19, D24). Single writer: owners and organizers edit
// the draft and publish numbered revisions from the console. Leaders, travelers, and guardians
// read the latest published revision (guardians get the same published view: D13 lists the
// published itinerary among what they may see). Change proposals from leaders are a later slice.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  CreateProposalRequest,
  DecideProposalRequest,
  Id,
  Itinerary,
  ItineraryEvent,
  ItineraryEventInput,
  ItineraryProposal,
  ProposalList,
  PublishItineraryRequest,
  PublishItineraryResponse,
  z,
} from '@voysemble/contracts';
import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { type OrgAccess, requireAuth, requireOrgRole } from '../auth/middleware';
import { db } from '../db/client';
import { organizations } from '../db/schema';
import type { AppEnv } from '../env';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const EventParams = z.object({ orgId: Id, tripId: Id, eventId: z.uuid() });

const getRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/itinerary',
  tags: ['itinerary'],
  summary:
    'The itinerary: draft for owners and organizers, latest published revision for everyone else',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: { description: 'Itinerary.', content: { 'application/json': { schema: Itinerary } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const upsertRoute = createRoute({
  method: 'put',
  path: '/v1/orgs/{orgId}/trips/{tripId}/itinerary/events/{eventId}',
  tags: ['itinerary'],
  summary: 'Create or replace a draft event (owner, organizer)',
  security: SESSION_SECURITY,
  request: {
    params: EventParams,
    body: { content: { 'application/json': { schema: ItineraryEventInput } } },
  },
  responses: {
    200: { description: 'Draft row.', content: { 'application/json': { schema: ItineraryEvent } } },
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
  path: '/v1/orgs/{orgId}/trips/{tripId}/itinerary/events/{eventId}',
  tags: ['itinerary'],
  summary: 'Remove a draft event (owner, organizer); published once the next revision is out',
  security: SESSION_SECURITY,
  request: { params: EventParams },
  responses: {
    204: { description: 'Removed.' },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const publishRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/itinerary/publish',
  tags: ['itinerary'],
  summary:
    'Publish the draft as the next revision (owner, organizer); 409 on a stale expected revision',
  security: SESSION_SECURITY,
  request: {
    params: TripParams,
    body: { content: { 'application/json': { schema: PublishItineraryRequest } } },
  },
  responses: {
    200: {
      description: 'Published, with the diff and the announcement it opened (if any).',
      content: { 'application/json': { schema: PublishItineraryResponse } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
    500: ERROR_RESPONSES[500],
  },
});

const ProposalParams = z.object({ orgId: Id, tripId: Id, proposalId: z.uuid() });

const createProposalRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/itinerary/proposals',
  tags: ['itinerary'],
  summary:
    'File a change proposal (participating leader, owner, organizer); the draft is untouched until accepted',
  security: SESSION_SECURITY,
  request: {
    params: TripParams,
    body: { content: { 'application/json': { schema: CreateProposalRequest } } },
  },
  responses: {
    201: { description: 'Filed.', content: { 'application/json': { schema: ItineraryProposal } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const listProposalsRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/itinerary/proposals',
  tags: ['itinerary'],
  summary: 'Proposals of a trip, pending first (participating leader, owner, organizer)',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: { description: 'Proposals.', content: { 'application/json': { schema: ProposalList } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const decideProposalRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/itinerary/proposals/{proposalId}/decide',
  tags: ['itinerary'],
  summary: 'Accept (applies to the draft) or reject a proposal (owner, organizer)',
  security: SESSION_SECURITY,
  request: {
    params: ProposalParams,
    body: { content: { 'application/json': { schema: DecideProposalRequest } } },
  },
  responses: {
    200: {
      description: 'Decided.',
      content: { 'application/json': { schema: ItineraryProposal } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
    500: ERROR_RESPONSES[500],
  },
});

/** Today's calendar date in a zone, YYYY-MM-DD. */
function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function isWriter(access: OrgAccess): boolean {
  return access.role === 'owner' || access.role === 'organizer';
}

export function mountItineraryRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(getRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const access = await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    const it = await org.getItinerary(tripId, isWriter(access) ? 'draft' : 'published');
    if (!it) throw new HTTPException(404, { message: 'Trip not found.' });
    return c.json(it, 200);
  });

  app.openapi(upsertRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, eventId } = c.req.valid('param');
    const body = c.req.valid('json');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    const result = await org.upsertItineraryEvent(tripId, eventId, body);
    if ('notFound' in result) throw new HTTPException(404, { message: 'Trip not found.' });
    if ('otherTrip' in result) {
      throw new HTTPException(409, { message: 'This event id belongs to another trip.' });
    }
    return c.json(result, 200);
  });

  app.openapi(deleteRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, eventId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    if (!(await org.deleteItineraryEvent(tripId, eventId))) {
      throw new HTTPException(404, { message: 'Event not found.' });
    }
    return c.body(null, 204);
  });

  app.openapi(publishRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const body = c.req.valid('json');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    const trip = await org.getTrip(tripId);
    if (!trip) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    const organization = await db(c.env.DB).query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });
    const result = await org.publishItinerary(
      tripId,
      body.expectedRevision,
      me?.displayName ?? 'Organizer',
      {
        notify: body.notify,
        note: body.note,
        today: todayIn(trip.timezone),
        locale: organization?.defaultLocale === 'en' ? 'en' : 'ko',
      },
    );
    if ('notFound' in result) throw new HTTPException(404, { message: 'Trip not found.' });
    if ('conflict' in result) {
      throw new HTTPException(409, {
        message: `The itinerary is at revision ${result.conflict}; reload before publishing.`,
      });
    }
    if ('nothing' in result) {
      throw new HTTPException(409, { message: 'Nothing to publish.' });
    }
    return c.json(result, 200);
  });

  app.openapi(createProposalRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const body = c.req.valid('json');
    const access = await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    if (!isWriter(access) && me?.role !== 'leader') {
      throw new HTTPException(403, {
        message: 'Only trip leaders and organizers propose itinerary changes.',
      });
    }
    const result = await org.createProposal({
      tripId,
      kind: body.kind,
      eventId: body.eventId,
      patch: body.patch,
      note: body.note,
      byParticipationId: me?.id ?? null,
      byName: me?.displayName ?? 'Organizer',
    });
    if ('notFound' in result) throw new HTTPException(404, { message: 'Trip not found.' });
    if ('eventNotFound' in result) {
      throw new HTTPException(404, { message: 'That itinerary event no longer exists.' });
    }
    if ('incomplete' in result) {
      throw new HTTPException(400, {
        message: 'An add proposal needs every event field in its patch.',
      });
    }
    return c.json(result.proposal, 201);
  });

  app.openapi(listProposalsRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const access = await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    if (!isWriter(access) && me?.role !== 'leader') {
      throw new HTTPException(403, { message: 'Only trip leaders and organizers see proposals.' });
    }
    return c.json({ proposals: await org.listProposals(tripId) }, 200);
  });

  app.openapi(decideProposalRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, proposalId } = c.req.valid('param');
    const body = c.req.valid('json');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    const result = await org.decideProposal({
      tripId,
      proposalId,
      decision: body.decision,
      note: body.note,
      byName: me?.displayName ?? 'Organizer',
    });
    if ('notFound' in result) throw new HTTPException(404, { message: 'Proposal not found.' });
    if ('decided' in result) {
      throw new HTTPException(409, { message: 'This proposal was already decided.' });
    }
    if ('gone' in result) {
      throw new HTTPException(409, {
        message: 'The event this proposal is about no longer exists; reject it instead.',
      });
    }
    return c.json(result.proposal, 200);
  });
}
