// Copyright 2026- At Day. All rights reserved.
//
// Per-person card and timeline (D17, slice 026): the organizer answers a guardian from recorded
// facts. Staff only: owner, organizer, or a leader participating in the trip. The join entry and
// the invite statuses come from D1 (invite codes); everything else from the organization's
// Durable Object.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { type PersonLink, PersonTimeline, type TimelineEntry } from '@voysemble/contracts';
import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth, requireOrgRole } from '../auth/middleware';
import { db } from '../db/client';
import { inviteCodes } from '../db/schema';
import type { AppEnv } from '../env';
import { nowIso } from '../lib/time';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { inviteStatusOf } from './roster';
import { TripParams } from './trips';

const PersonParams = TripParams.extend({ participationId: z.uuid() });

const timelineRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/people/{participationId}/timeline',
  tags: ['people'],
  summary: "One person's card: roster entry, guardian links, and the timeline of recorded facts",
  description:
    'Owner, organizer, or a leader participating in the trip. Entries newest first (at most 200): the join, acknowledgments, head counts covering a traveler or opened by a leader, incidents naming the person with resolution and guardian message, confirmations a leader gave.',
  security: SESSION_SECURITY,
  request: { params: PersonParams },
  responses: {
    200: { description: 'Card.', content: { 'application/json': { schema: PersonTimeline } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

export function mountPeopleRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(timelineRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, participationId } = c.req.valid('param');
    const access = await requireOrgRole(c.env, auth, orgId, 'member');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const me = await org.participationForAccount(tripId, auth.accountId);
    const staff = access.role === 'owner' || access.role === 'organizer' || me?.role === 'leader';
    if (!staff) throw new HTTPException(403, { message: 'Only trip staff see person cards.' });
    const roster = await org.listRosterWithAcks(tripId);
    const person = roster.find((p) => p.id === participationId);
    if (!person) throw new HTTPException(404, { message: 'Person not found.' });
    const codes = await db(c.env.DB)
      .select({
        participationId: inviteCodes.participationId,
        expiresAt: inviteCodes.expiresAt,
        redeemedAt: inviteCodes.redeemedAt,
        revokedAt: inviteCodes.revokedAt,
      })
      .from(inviteCodes)
      .where(eq(inviteCodes.tripId, tripId))
      .all();
    const now = nowIso();
    const codesOf = (id: string) => codes.filter((k) => k.participationId === id);
    const link = (p: {
      id: string;
      displayName: string;
      accountId: string | null;
    }): PersonLink => ({
      participationId: p.id,
      displayName: p.displayName,
      invite: inviteStatusOf(p.accountId, codesOf(p.id), now),
    });
    const entries = (await org.personTimeline(tripId, participationId)) ?? [];
    const redeemed = codesOf(participationId).find((k) => k.redeemedAt)?.redeemedAt;
    const joined: TimelineEntry[] = redeemed
      ? [
          {
            kind: 'joined',
            at: redeemed,
            title: 'Joined with the invite code',
            detail: null,
            ref: null,
          },
        ]
      : [];
    const all = [...entries, ...joined].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200);
    const traveler = person.guardianOf ? roster.find((p) => p.id === person.guardianOf) : null;
    const guardians = person.role === 'traveler' ? await org.guardiansOf(tripId, person.id) : [];
    return c.json(
      {
        participation: {
          ...person,
          invite: inviteStatusOf(person.accountId, codesOf(person.id), now),
        },
        guardianOf: traveler ? link(traveler) : null,
        guardians: guardians.map(link),
        entries: all,
      },
      200,
    );
  });
}
