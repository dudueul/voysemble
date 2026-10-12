// Copyright 2026- At Day. All rights reserved.
//
// Browser client for the Voysemble API. Same origin as the console (ADR-0008), so the session
// cookie travels automatically and no CORS exists. Every non-2xx is turned into ApiError with
// the server's ErrorEnvelope code and correlation id so screens can show a support reference.

export type ApiErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'NETWORK';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly correlationId: string,
    readonly details: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Envelope = {
  error?: {
    code?: string;
    message?: string;
    correlationId?: string;
    details?: { path: string; message: string }[];
  };
};

const KNOWN: ReadonlySet<string> = new Set([
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
]);

export async function api<T>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body === undefined ? {} : { 'content-type': 'application/json' },
      body: init.body === undefined ? null : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network unavailable.', 'none');
  }
  if (res.ok) {
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  let env: Envelope = {};
  try {
    env = (await res.json()) as Envelope;
  } catch {
    // Non-JSON error (proxy, asset server): fall through with a generic code.
  }
  const code = env.error?.code && KNOWN.has(env.error.code) ? env.error.code : 'INTERNAL';
  throw new ApiError(
    res.status,
    code as ApiErrorCode,
    env.error?.message ?? `Request failed (${res.status}).`,
    env.error?.correlationId ?? res.headers.get('X-Correlation-Id') ?? 'none',
    env.error?.details ?? [],
  );
}
