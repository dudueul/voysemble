// Copyright 2026- At Day. All rights reserved.
// Facts: ErrorEnvelope becomes ApiError with code and correlation id; non-JSON errors still
// produce ApiError; network failure is NETWORK; cookies are sent same-origin.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './api-client';

afterEach(() => vi.unstubAllGlobals());

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function failure(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('expected rejection');
}

describe('api()', () => {
  it('parses JSON on success and sends credentials', async () => {
    const fetchMock = vi.fn<FetchFn>(async () => Response.json({ ok: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await api<{ ok: number }>('/v1/x')).toEqual({ ok: 1 });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.credentials).toBe('same-origin');
    expect(init?.body).toBeNull();
  });

  it('turns an ErrorEnvelope into ApiError', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json(
        { error: { code: 'FORBIDDEN', message: 'Nope.', correlationId: 'corr-1' } },
        { status: 403 },
      ),
    );
    const err = await failure(api('/v1/x'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.correlationId).toBe('corr-1');
    expect(err.message).toBe('Nope.');
  });

  it('non-JSON error body still yields ApiError with the header correlation id', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('<html>', { status: 502, headers: { 'X-Correlation-Id': 'h-1' } }),
    );
    const err = await failure(api('/v1/x'));
    expect(err.code).toBe('INTERNAL');
    expect(err.status).toBe(502);
    expect(err.correlationId).toBe('h-1');
  });

  it('fetch rejection is a NETWORK ApiError', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    const err = await failure(api('/v1/x'));
    expect(err.code).toBe('NETWORK');
    expect(err.status).toBe(0);
  });
});
