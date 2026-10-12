// Copyright 2026- At Day. All rights reserved.
//
// Packing checklist (D38, slice 048). Owners and organizers define the items; leaders and the
// organizer read progress per item and per traveler; a traveler (or a leader, for themselves)
// ticks their own list on the phone; a guardian ticks for the traveler they are bound to. Ticks
// are tier 1 facts: an item name and a time, never where anyone is.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  CreatePackingItemRequest,
  DeletePackingItemResponse,
  MyPackingItem,
  MyPackingList,
  PackingItem,
  PackingList,
  SetPackedRequest,
  UpdatePackingItemRequest,
} from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth, requireOrgRole } from '../auth/middleware';
import type { AppEnv, AuthContext } from '../env';
import { nowIso } from '../lib/time';
import { orgObject } from '../org/client';
import type { OrgDurableObject } from '../org/OrgDurableObject';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const ItemParams = TripParams.extend({ itemId: z.uuid() });

const listRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/packing',
  tags: ['packing'],
  summary: 'The items with their counts and every traveler’s progress (owner, organizer, leader)',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: { description: 'The list.', content: { 'application/json': { schema: PackingList } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const createRoute_ = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/packing',
  tags: ['packing'],
  summary: 'Add an item (owner, organizer)',
  security: SESSION_SECURITY,
  request: {
    params: TripParams,
    body: { content: { 'application/json': { schema: CreatePackingItemRequest } } },
  },
  responses: {
    201: { description: 'Created.', content: { 'application/json': { schema: PackingItem } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const updateRoute = createRoute({
  method: 'patch',
  path: '/v1/orgs/{orgId}/trips/{tripId}/packing/{itemId}',
  tags: ['packing'],
  summary: 'Rename an item or change its note (owner, organizer)',
  security: SESSION_SECURITY,
  request: {
    params: ItemParams,
    body: { content: { 'application/json': { schema: UpdatePackingItemRequest } } },
  },
  responses: {
    200: { description: 'Updated.', content: { 'application/json': { schema: PackingItem } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/v1/orgs/{orgId}/trips/{tripId}/packing/{itemId}',
  tags: ['packing'],
  summary: 'Remove an item and its ticks (owner, organizer)',
  security: SESSION_SECURITY,
  request: { params: ItemParams },
  responses: {
    200: {
      description: 'Removed.',
      content: { 'application/json': { schema: DeletePackingItemResponse } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const mineRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/packing/mine',
  tags: ['packing'],
  summary: 'My list: a traveler’s or leader’s own, or a guardian’s for their traveler',
  description:
    'Needs a participation on the trip: a traveler or a leader packs for themselves, a guardian for the traveler they are bound to. An organizer without a participation is 403.',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: { description: 'The list.', content: { 'application/json': { schema: MyPackingList } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const tickRoute = createRoute({
  method: 'put',
  path: '/v1/orgs/{orgId}/trips/{tripId}/packing/{itemId}/mine',
  tags: ['packing'],
  summary:
    'Tick or untick one item on my list (traveler, leader for themselves; guardian for their traveler)',
  security: SESSION_SECURITY,
  request: {
    params: ItemParams,
    body: { content: { 'application/json': { schema: SetPackedRequest } } },
  },
  responses: {
    200: {
      description: 'The item as it is now.',
      content: { 'application/json': { schema: MyPackingItem } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

/** Owner or organizer, on a trip that exists. */
async function organizerFor(
  env: AppEnv['Bindings'],
  auth: AuthContext,
  orgId: string,
  tripId: string,
): Promise<DurableObjectStub<OrgDurableObject>> {
  await requireOrgRole(env, auth, orgId, 'organizer');
  const org = await orgObject(env, orgId);
  if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
  return org;
}

/** Who the caller packs for: themselves (traveler, leader) or the traveler a guardian is bound to. */
async function packerFor(
  env: AppEnv['Bindings'],
  auth: AuthContext,
  orgId: string,
  tripId: string,
): Promise<{
  org: DurableObjectStub<OrgDurableObject>;
  participationId: string;
  packingFor: 'self' | 'guardian';
  role: string;
}> {
  await requireOrgRole(env, auth, orgId, 'member');
  const org = await orgObject(env, orgId);
  if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
  const me = await org.participationForAccount(tripId, auth.accountId);
  if (!me) throw new HTTPException(403, { message: 'Only a trip participant packs.' });
  if (me.role === 'guardian') {
    if (!me.guardianOf) {
      throw new HTTPException(403, { message: 'This guardian is not bound to a traveler.' });
    }
    return { org, participationId: me.guardianOf, packingFor: 'guardian', role: me.role };
  }
  return { org, participationId: me.id, packingFor: 'self', role: me.role };
}

export function mountPackingRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'leader');
    const org = await orgObject(c.env, orgId);
    const r = await org.listPacking(tripId);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Trip not found.' });
    return c.json(r, 200);
  });

  app.openapi(createRoute_, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const body = c.req.valid('json');
    const org = await organizerFor(c.env, auth, orgId, tripId);
    const r = await org.createPackingItem(tripId, body, nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: 'Trip not found.' });
    return c.json(r, 201);
  });

  app.openapi(updateRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, itemId } = c.req.valid('param');
    const body = c.req.valid('json');
    const org = await organizerFor(c.env, auth, orgId, tripId);
    const r = await org.updatePackingItem(tripId, itemId, body);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Item not found.' });
    return c.json(r, 200);
  });

  app.openapi(deleteRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, itemId } = c.req.valid('param');
    const org = await organizerFor(c.env, auth, orgId, tripId);
    const r = await org.deletePackingItem(tripId, itemId);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Item not found.' });
    return c.json({ deleted: true as const, itemId }, 200);
  });

  app.openapi(mineRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const who = await packerFor(c.env, auth, orgId, tripId);
    const r = await who.org.myPacking(tripId, who.participationId, who.packingFor);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Trip not found.' });
    return c.json(r, 200);
  });

  app.openapi(tickRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, itemId } = c.req.valid('param');
    const { packed } = c.req.valid('json');
    const who = await packerFor(c.env, auth, orgId, tripId);
    const r = await who.org.setPacked(
      tripId,
      itemId,
      who.participationId,
      packed,
      who.role,
      nowIso(),
    );
    if ('notFound' in r) throw new HTTPException(404, { message: 'Item not found.' });
    return c.json(r, 200);
  });
}
