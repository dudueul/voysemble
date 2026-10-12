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
import { authenticate, ReauthRequiredError, WIPE_HEADER } from './auth/middleware';
import type { AppEnv } from './env';
import { RateLimitedError } from './lib/rate-limit';
import { mountAnnouncementRoutes } from './routes/announcements';
import { mountAuthRoutes } from './routes/auth';
import { mountCareRoutes } from './routes/care';
import { mountChatRoutes } from './routes/chat';
import { mountDevRoutes } from './routes/dev';
import { mountDocumentRoutes } from './routes/documents';
import { mountFeeRoutes } from './routes/fees';
import { mountGuardianRoutes } from './routes/guardian';
import { mountHeadcountRoutes } from './routes/headcounts';
import { healthHandler, healthRoute } from './routes/health';
import { mountIncidentRoutes } from './routes/incidents';
import { mountInvitationRoutes } from './routes/invitations';
import { mountItineraryRoutes } from './routes/itinerary';
import { mountMediaRoutes } from './routes/media';
import { mountOrganizationRoutes } from './routes/organizations';
import { mountPeopleRoutes } from './routes/people';
import { mountReportRoutes } from './routes/reports';
import { mountRosterRoutes } from './routes/roster';
import { mountTripRoutes } from './routes/trips';
import { mountWellKnownRoutes } from './routes/wellknown';
import { mountWindowRoutes } from './routes/windows';

const CORRELATION_HEADER = 'X-Correlation-Id';
/** Mirrors wrangler.jsonc assets.run_worker_first. */
const WORKER_FIRST_PREFIXES = ['/v1', '/openapi.json', '/webhooks'];

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
  // Resolves the session (cookie or bearer) for every request; routes decide if one is required.
  app.use('/v1/*', authenticate);

  // API namespaces answer JSON 404. Everything else falls through to the organizer console
  // bundle (Workers Static Assets, SPA fallback). In production asset-first routing serves those
  // paths before the Worker runs; this branch covers tests and any path that reaches the Worker.
  app.notFound((c) => {
    const path = new URL(c.req.url).pathname;
    const isApi = WORKER_FIRST_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
    if (!isApi && (c.req.method === 'GET' || c.req.method === 'HEAD')) {
      // Re-wrap: the asset response has immutable headers and downstream middleware adds ours.
      return c.env.ASSETS.fetch(c.req.raw).then((res) => new Response(res.body, res));
    }
    return c.json(errorBody('NOT_FOUND', 'No such route.', c.get('correlationId')), 404);
  });

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
      if (err.status === 401 && c.get('wiped')) {
        // D28: the wipe directive rides the 401 of a revoked session (code + header).
        return c.json(errorBody('SESSION_WIPED', err.message, correlationId), 401, {
          [WIPE_HEADER]: '1',
        });
      }
      if (err instanceof ReauthRequiredError) {
        // Slice 045 (D35): the console asks for the emailed confirmation and retries.
        return c.json(errorBody('REAUTH_REQUIRED', err.message, correlationId), 403);
      }
      if (err instanceof RateLimitedError) {
        // Slice 041: the wait rides the 429 so a client can back off without guessing.
        return c.json(errorBody('RATE_LIMITED', err.message, correlationId), 429, {
          'Retry-After': String(err.retryAfterSeconds),
        });
      }
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
  mountAuthRoutes(app);
  mountOrganizationRoutes(app);
  mountInvitationRoutes(app);
  mountTripRoutes(app);
  mountRosterRoutes(app);
  mountAnnouncementRoutes(app);
  mountHeadcountRoutes(app);
  mountIncidentRoutes(app);
  mountItineraryRoutes(app);
  mountGuardianRoutes(app);
  mountPeopleRoutes(app);
  mountFeeRoutes(app);
  mountWindowRoutes(app);
  mountCareRoutes(app);
  mountChatRoutes(app);
  mountReportRoutes(app);
  mountMediaRoutes(app);
  mountDocumentRoutes(app);
  mountDevRoutes(app);
  mountWellKnownRoutes(app);

  app.openAPIRegistry.registerComponent('securitySchemes', 'sessionCookie', {
    type: 'apiKey',
    in: 'cookie',
    name: 'vy_session',
  });
  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerToken', {
    type: 'http',
    scheme: 'bearer',
  });

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
