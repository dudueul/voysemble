// Copyright 2026- At Day. All rights reserved.
//
// GET /v1/health response. Used by uptime checks and by every environment's smoke test.

import { z } from '@hono/zod-openapi';

export const HealthResponse = z
  .object({
    status: z.literal('ok'),
    service: z.literal('voysemble-api'),
    envName: z.string().describe('local | preview | staging | production'),
    buildId: z.string().describe('Git SHA or build symbol injected at deploy time.'),
    time: z.string().datetime().describe('Server time, RFC 3339 UTC.'),
  })
  .openapi('HealthResponse');
export type HealthResponse = z.infer<typeof HealthResponse>;
