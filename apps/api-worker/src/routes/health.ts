// Copyright 2026- At Day. All rights reserved.
//
// GET /v1/health. No auth. Reports environment and build so smoke tests can prove which
// deployment answered.

import type { RouteHandler } from '@hono/zod-openapi';
import { createRoute } from '@hono/zod-openapi';
import { ErrorEnvelope, HealthResponse } from '@voysemble/contracts';
import type { AppEnv } from '../env';

export const healthRoute = createRoute({
  method: 'get',
  path: '/v1/health',
  tags: ['system'],
  summary: 'Liveness and build identity',
  responses: {
    200: {
      description: 'Service is up.',
      content: { 'application/json': { schema: HealthResponse } },
    },
    500: {
      description: 'Unexpected failure.',
      content: { 'application/json': { schema: ErrorEnvelope } },
    },
  },
});

export const healthHandler: RouteHandler<typeof healthRoute, AppEnv> = (c) =>
  c.json(
    {
      status: 'ok' as const,
      service: 'voysemble-api' as const,
      envName: c.env.ENV_NAME,
      buildId: c.env.BUILD_ID,
      time: new Date().toISOString(),
    },
    200,
  );
