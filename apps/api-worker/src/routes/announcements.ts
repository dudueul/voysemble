// Copyright 2026- At Day. All rights reserved.
//
// /v1/orgs/{orgId}/trips/{tripId}/announcements (D16, D13, ADR-0009).
// - Create: owner/organizer, or a leader who participates in the trip.
// - List: any member; guardians receive only `sharedWithGuardians` items; `myAck` is computed
//   from the caller's participation.
// - Ack: the caller's own participation must have ack duty (traveler or leader). Idempotent by
//   (announcement, participation) so the offline outbox can replay freely.
// - Ack status: owner/organizer or participating leader; names of acked/unacked people.
// Machine translation (Workers AI, ADR-0006) runs once at publish through the AI port and is
// cached on the row; a bilingual leader may replace it (`PUT .../translation`, labelled edited).

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  AckRequest,
  AckResponse,
  AckStatus,
  Announcement,
  AnnouncementList,
  CreateAnnouncementRequest,
  EditTranslationRequest,
  Id,
  type Participation,
  z,
} from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { aiPort, detectLocale, otherLocale } from '../ai/AiPort';
import { type OrgAccess, requireAuth, requireOrgRole } from '../auth/middleware';
import type { AppEnv, AuthContext } from '../env';
import { orgObject } from '../org/client';
import type { OrgDurableObject } from '../org/OrgDurableObject';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const AnnouncementParams = z.object({ orgId: Id, tripId: Id, announcementId: Id });

const createAnnouncementRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/announcements',
  tags: ['announcements'],
  summary: 'Publish an announcement (owner, organizer, or a leader on the trip)',
  security: SESSION_SECURITY,
  request: {
    params: TripParams,
    body: { content: { 'application/json': { schema: CreateAnnouncementRequest } } },
  },
  responses: {
    201: { description: 'Published.', content: { 'application/json': { schema: Announcement } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const editTranslationRoute = createRoute({
  method: 'put',
  path: '/v1/orgs/{orgId}/trips/{tripId}/announcements/{announcementId}/translation',
  tags: ['announcements'],
  summary: "Replace the translation with a bilingual staff member's text (labelled edited)",
  security: SESSION_SECURITY,
  request: {
    params: AnnouncementParams,
    body: { content: { 'application/json': { schema: EditTranslationRequest } } },
  },
  responses: {
    200: { description: 'Updated.', content: { 'application/json': { schema: Announcement } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const listAnnouncementsRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/announcements',
  tags: ['announcements'],
  summary: 'Announcements visible to the caller, newest first',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: {
      description: 'Announcements.',
      content: { 'application/json': { schema: AnnouncementList } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const ackRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/announcements/{announcementId}/ack',
  tags: ['announcements'],
  summary: 'Acknowledge an announcement (idempotent per participation)',
  security: SESSION_SECURITY,
  request: {
    params: AnnouncementParams,
    body: { content: { 'application/json': { schema: AckRequest } } },
  },
  responses: {
    200: {
      description: 'Stored (or already stored).',
      content: { 'application/json': { schema: AckResponse } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const ackStatusRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/announcements/{announcementId}/acks',
  tags: ['announcements'],
  summary: 'Who acknowledged and who has not (owner, organizer, or a leader on the trip)',
  security: SESSION_SECURITY,
  request: { params: AnnouncementParams },
  responses: {
    200: { description: 'Ack status.', content: { 'application/json': { schema: AckStatus } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

/** Resolves org access, trip existence, and the caller's participation in one go. */
async function tripContext(
  env: Env,
  auth: AuthContext,
  orgId: string,
  tripId: string,
): Promise<{
  access: OrgAccess;
  org: DurableObjectStub<OrgDurableObject>;
  me: Participation | null;
}> {
  const access = await requireOrgRole(env, auth, orgId, 'member');
  const org = await orgObject(env, orgId);
  if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
  const me = await org.participationForAccount(tripId, auth.accountId);
  return { access, org, me };
}

function canPublish(access: OrgAccess, me: Participation | null): boolean {
  return access.role === 'owner' || access.role === 'organizer' || me?.role === 'leader';
}

export function mountAnnouncementRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(createAnnouncementRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const body = c.req.valid('json');
    const { access, org, me } = await tripContext(c.env, auth, orgId, tripId);
    if (!canPublish(access, me)) {
      throw new HTTPException(403, {
        message: 'Only organizers and trip leaders publish announcements.',
      });
    }
    // Translate once into the other supported language; the original is always what is shown
    // first. A null answer (provider down, budget out, fixture miss) stores no translation.
    const source = detectLocale(body.body);
    const target = otherLocale(source);
    const translated = await aiPort(c.env).translate({ text: body.body, source, target });
    const created = await org.createAnnouncement({
      tripId,
      ...body,
      authorParticipationId: me?.id ?? null,
      authorName: me?.displayName ?? 'Organizer',
      translation: translated
        ? { locale: target, body: translated, provider: 'machine', editedBy: null }
        : null,
    });
    return c.json(created, 201);
  });

  app.openapi(editTranslationRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, announcementId } = c.req.valid('param');
    const body = c.req.valid('json');
    const { access, org, me } = await tripContext(c.env, auth, orgId, tripId);
    if (!canPublish(access, me)) {
      throw new HTTPException(403, {
        message: 'Only organizers and trip leaders edit translations.',
      });
    }
    const current = await org.getAnnouncement(announcementId, me);
    if (!current || current.tripId !== tripId) {
      throw new HTTPException(404, { message: 'Announcement not found.' });
    }
    const locale = current.translation?.locale ?? otherLocale(detectLocale(current.body));
    const updated = await org.setTranslation(
      tripId,
      announcementId,
      { locale, body: body.body, provider: 'edited', editedBy: me?.displayName ?? 'Organizer' },
      me?.id ?? null,
    );
    if (!updated) throw new HTTPException(404, { message: 'Announcement not found.' });
    return c.json(updated, 200);
  });

  app.openapi(listAnnouncementsRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const { org, me } = await tripContext(c.env, auth, orgId, tripId);
    return c.json({ announcements: await org.listAnnouncements(tripId, me) }, 200);
  });

  app.openapi(ackRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, announcementId } = c.req.valid('param');
    const { ackedAtDevice } = c.req.valid('json');
    const { org, me } = await tripContext(c.env, auth, orgId, tripId);
    if (!me || (me.role !== 'traveler' && me.role !== 'leader')) {
      throw new HTTPException(403, {
        message: 'Only travelers and leaders on this trip acknowledge.',
      });
    }
    const a = await org.getAnnouncement(announcementId, me);
    if (!a || a.tripId !== tripId)
      throw new HTTPException(404, { message: 'Announcement not found.' });
    if (!a.requiresAck)
      throw new HTTPException(400, { message: 'This announcement does not take acknowledgments.' });
    const r = await org.ack(announcementId, me.id, ackedAtDevice);
    return c.json({ announcementId, participationId: me.id, ...r }, 200);
  });

  app.openapi(ackStatusRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, announcementId } = c.req.valid('param');
    const { access, org, me } = await tripContext(c.env, auth, orgId, tripId);
    if (!canPublish(access, me)) {
      throw new HTTPException(403, { message: 'Only organizers and trip leaders see ack status.' });
    }
    const status = await org.ackStatus(announcementId);
    const a = await org.getAnnouncement(announcementId, null);
    if (!status || !a || a.tripId !== tripId)
      throw new HTTPException(404, { message: 'Announcement not found.' });
    return c.json(status, 200);
  });
}
