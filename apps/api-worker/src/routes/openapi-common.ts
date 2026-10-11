// Copyright 2026- At Day. All rights reserved.
//
// Shared OpenAPI response fragments so every route documents the same error shapes.

import { ErrorEnvelope } from '@voysemble/contracts';

const json = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorEnvelope } },
});

export const ERROR_RESPONSES = {
  400: json('Validation failed.'),
  401: json('Sign in required.'),
  403: json('Not allowed for this account or organization.'),
  404: json('Not found.'),
  409: json('Conflict.'),
  500: json('Unexpected failure.'),
} as const;

/** Security requirement name registered in app.ts. */
export const SESSION_SECURITY = [{ sessionCookie: [] }, { bearerToken: [] }];
