// Copyright 2026- At Day. All rights reserved.
//
// Application factory. Owns: middleware order, error envelope, OpenAPI document, route mounting.
// Must not: contain business logic. Routes call capabilities; capabilities live in modules.
// Invariants: every response carries X-Correlation-Id; every error is an ErrorEnvelope;
// no stack trace or provider message reaches a client.

import { OpenAPIHono } from '@hono/zod-openapi';
import type { ErrorEnvelope } from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './env';
import { healthHandler, healthRoute } from './routes/health';

const CORRELATION_HEADER = 'X-Correlation-Id';

function errorBody(
  code: ErrorEnvelope['error']['code'],
  message: string,
  correlationId: string,
  details?: ErrorEnvelope['error']['details'],
): ErrorEnvelope {
  return { error: { code, message, correlationId, ...(details ? { details } : {}) } };
}

export function createApp(): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>({
    // Zod validation failures become a VALIDATION_FAILED envelope, not Hono's default 400 text.
    defaultHook: (result, c) => {
      if (result.success) return;
      const details = result.error.issues.map((i) => ({
        path: i.path.map(String).join('.'),
        message: i.message,
      }));
      return c.json(
        errorBody(
          'VALIDATION_FAILED',
          'Request failed validation.',
          c.get('correlationId'),
          details,
        ),
        400,
      );
    },
  });

  app.use('*', async (c, next) => {
    const incoming = c.req.header(CORRELATION_HEADER);
    const id = incoming && /^[A-Za-z0-9_-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    c.set('correlationId', id);
    await next();
    c.header(CORRELATION_HEADER, id);
  });
  app.use('*', secureHeaders());

  app.notFound((c) =>
    c.json(errorBody('NOT_FOUND', 'No such route.', c.get('correlationId')), 404),
  );

  app.onError((err, c) => {
    const correlationId = c.get('correlationId') ?? 'unknown';
    if (err instanceof HTTPException) {
      const code =
        err.status === 401
          ? 'UNAUTHENTICATED'
          : err.status === 403
            ? 'FORBIDDEN'
            : err.status === 404
              ? 'NOT_FOUND'
              : err.status === 409
                ? 'CONFLICT'
                : err.status === 429
                  ? 'RATE_LIMITED'
                  : 'INTERNAL';
      return c.json(errorBody(code, err.message || 'Request failed.', correlationId), err.status);
    }
    // Unexpected failure: log the real error with the correlation id, return a safe envelope.
    console.error(
      JSON.stringify({
        level: 'error',
        correlationId,
        name: err.name,
        message: err.message,
        stack: err.stack,
      }),
    );
    return c.json(errorBody('INTERNAL', 'Unexpected error.', correlationId), 500);
  });

  app.openapi(healthRoute, healthHandler);

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Voysemble API',
      version: '0.0.1',
      description:
        'Customer API for the organizer console and native apps. Generated from Zod contracts.',
    },
  });

  return app;
}
