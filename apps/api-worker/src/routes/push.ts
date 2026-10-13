// Copyright 2026- At Day. All rights reserved.
//
// /v1/me/push-device (D29, slice 088): a signed-in phone registers its push token for its own
// session, and removes it. One device per session; a token registered again by another session
// moves there (a reinstall, a new sign-in on the same phone). Delivery is lib/push.ts.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { PushDevice, PushDeviceRemoved, RegisterPushDeviceRequest } from '@voysemble/contracts';
import { eq, or } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware';
import { db } from '../db/client';
import { pushDevices } from '../db/schema';
import type { AppEnv } from '../env';
import { nowIso } from '../lib/time';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';

const registerRoute = createRoute({
  method: 'put',
  path: '/v1/me/push-device',
  tags: ['notifications'],
  summary: "Register this session's push token (APNs or FCM)",
  description:
    "Slice 088 (D29). One device per session: a new token replaces the session's earlier one, and a token registered by another session moves to this one. Delivery follows the notification lanes (priority at once, normal after quiet hours, digest by email only) and skips revoked or expired sessions.",
  security: SESSION_SECURITY,
  request: { body: { content: { 'application/json': { schema: RegisterPushDeviceRequest } } } },
  responses: {
    200: { description: 'Registered.', content: { 'application/json': { schema: PushDevice } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    500: ERROR_RESPONSES[500],
  },
});

const removeRoute = createRoute({
  method: 'delete',
  path: '/v1/me/push-device',
  tags: ['notifications'],
  summary: "Remove this session's push token (the app turned notifications off or signs out)",
  security: SESSION_SECURITY,
  responses: {
    200: {
      description: 'Removed.',
      content: { 'application/json': { schema: PushDeviceRemoved } },
    },
    401: ERROR_RESPONSES[401],
    500: ERROR_RESPONSES[500],
  },
});

export function mountPushRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(registerRoute, async (c) => {
    const auth = requireAuth(c);
    const body = c.req.valid('json');
    const d = db(c.env.DB);
    const now = nowIso();
    await d
      .delete(pushDevices)
      .where(or(eq(pushDevices.token, body.token), eq(pushDevices.sessionId, auth.sessionId)));
    await d.insert(pushDevices).values({
      id: crypto.randomUUID(),
      accountId: auth.accountId,
      sessionId: auth.sessionId,
      platform: body.platform,
      token: body.token,
      apnsEnvironment: body.platform === 'ios' ? (body.apnsEnvironment ?? 'production') : null,
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ platform: body.platform, registeredAt: now }, 200);
  });

  app.openapi(removeRoute, async (c) => {
    const auth = requireAuth(c);
    const r = await db(c.env.DB)
      .delete(pushDevices)
      .where(eq(pushDevices.sessionId, auth.sessionId))
      .run();
    return c.json({ removed: r.meta.changes ?? 0 }, 200);
  });
}
