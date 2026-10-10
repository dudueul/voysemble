// Copyright 2026- At Day. All rights reserved.
// Fact: unknown routes produce the shared ErrorEnvelope with NOT_FOUND, never plain text.

import { SELF } from 'cloudflare:test';
import { ErrorEnvelope } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';

describe('error envelope', () => {
  it('404 is an ErrorEnvelope with the correlation id inside', async () => {
    const res = await SELF.fetch('https://example.com/v1/nope', {
      headers: { 'X-Correlation-Id': 'corr-404-test' },
    });
    expect(res.status).toBe(404);
    const body = ErrorEnvelope.parse(await res.json());
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.correlationId).toBe('corr-404-test');
  });

  it('sets security headers on every response', async () => {
    const res = await SELF.fetch('https://example.com/v1/health');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
  });
});
