// Copyright 2026- At Day. All rights reserved.
// Fact: GET /v1/health answers 200 with a body that satisfies the published contract.

import { SELF } from 'cloudflare:test';
import { HealthResponse } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';

describe('GET /v1/health', () => {
  it('returns a contract-valid body and echoes a correlation id', async () => {
    const res = await SELF.fetch('https://example.com/v1/health');
    expect(res.status).toBe(200);
    const body = HealthResponse.parse(await res.json());
    expect(body.envName).toBe('local');
    expect(body.buildId).toBe('local');
    expect(res.headers.get('X-Correlation-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('preserves a well-formed incoming correlation id', async () => {
    const res = await SELF.fetch('https://example.com/v1/health', {
      headers: { 'X-Correlation-Id': 'trace-abc123' },
    });
    expect(res.headers.get('X-Correlation-Id')).toBe('trace-abc123');
  });
});
