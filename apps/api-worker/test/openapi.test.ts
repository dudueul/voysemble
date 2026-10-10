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
      components: { schemas: Record<string, unknown> };
    };
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toContain('/v1/health');
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(['HealthResponse', 'ErrorEnvelope']),
    );
  });
});
