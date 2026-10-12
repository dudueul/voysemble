// Copyright 2026- At Day. All rights reserved.
//
// Shared safe error envelope. Never carries provider exceptions, SQL text, or stack traces.

import { z } from '@hono/zod-openapi';

/** Stable machine-readable error codes. Add, never rename. */
export const ErrorCode = z.enum([
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
  /** 401 from a session the organizer revoked with a wipe (D28): the phone clears its state. */
  'SESSION_WIPED',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorEnvelope = z
  .object({
    error: z.object({
      code: ErrorCode,
      message: z.string().describe('Human-readable, safe to show to end users.'),
      correlationId: z.string().describe('Echoes the X-Correlation-Id of the request.'),
      details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    }),
  })
  .openapi('ErrorEnvelope');
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;
