// Copyright 2026- At Day. All rights reserved.
//
// Local-only developer routes. Mounted only when the fixture mailbox binding exists AND
// ENV_NAME is "local" (wrangler dev and vitest). Named environments never bind DEV_MAILBOX, so
// this file is inert there by construction. Lets the browser E2E suite read the magic link the
// FixtureEmailPort captured, the same way a developer would read it from the local KV.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { FixtureEmailPort } from '../email/EmailPort';
import type { AppEnv } from '../env';
import { ERROR_RESPONSES } from './openapi-common';

const DevMail = z
  .object({
    to: z.string(),
    subject: z.string(),
    text: z.string(),
    locale: z.enum(['ko', 'en']),
    tag: z.enum(['magic-link', 'invite', 'digest', 'incident']),
  })
  .openapi('DevMail');

const mailboxRoute = createRoute({
  method: 'get',
  path: '/v1/dev/mailbox',
  tags: ['dev'],
  summary: 'Latest fixture email for an address (local only)',
  request: { query: z.object({ to: z.email() }) },
  responses: {
    200: {
      description: 'Newest captured message.',
      content: { 'application/json': { schema: DevMail } },
    },
    404: ERROR_RESPONSES[404],
  },
});

export function mountDevRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(mailboxRoute, async (c) => {
    const mailbox = c.env.DEV_MAILBOX;
    if (!mailbox || c.env.ENV_NAME !== 'local') {
      throw new HTTPException(404, { message: 'No such route.' });
    }
    const { to } = c.req.valid('query');
    const mail = await FixtureEmailPort.latest(mailbox, to.toLowerCase());
    if (!mail) throw new HTTPException(404, { message: 'No mail for that address.' });
    return c.json(mail, 200);
  });
}
