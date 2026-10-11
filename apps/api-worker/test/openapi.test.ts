// Copyright 2026- At Day. All rights reserved.
// Fact: /openapi.json is a 3.1 document that lists the health route and the error component.

import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('GET /openapi.json', () => {
  it('serves OpenAPI 3.1 with known paths and components', async () => {
    const res = await SELF.fetch('https://example.com/openapi.json');
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
    };
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/v1/health',
        '/v1/auth/magic-link',
        '/v1/auth/magic-link/verify',
        '/v1/auth/logout',
        '/v1/me',
        '/v1/me/participations',
        '/v1/orgs',
        '/v1/orgs/{orgId}/trips',
        '/v1/orgs/{orgId}/trips/{tripId}/roster/import',
        '/v1/orgs/{orgId}/trips/{tripId}/roster',
        '/v1/orgs/{orgId}/trips/{tripId}/invites',
        '/v1/orgs/{orgId}/trips/{tripId}/roster/leaders',
        '/v1/invites/redeem',
        '/v1/orgs/{orgId}/trips/{tripId}/announcements',
        '/v1/orgs/{orgId}/trips/{tripId}/announcements/{announcementId}/ack',
        '/v1/orgs/{orgId}/trips/{tripId}/announcements/{announcementId}/translation',
        '/v1/orgs/{orgId}/trips/{tripId}/headcounts/{headcountId}',
        '/v1/orgs/{orgId}/trips/{tripId}/incidents',
        '/v1/orgs/{orgId}/trips/{tripId}/incidents/{incidentId}/resolve',
      ]),
    );
    expect(Object.keys(doc.components.securitySchemes)).toEqual(['sessionCookie', 'bearerToken']);
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(['HealthResponse', 'ErrorEnvelope', 'Participation', 'InviteRole']),
    );
  });
});
