// Copyright 2026- At Day. All rights reserved.
// One line for a failed call: the page's own fallback plus the correlation id when the API
// answered (so support can find the request), the fallback alone when it did not.

import { ApiError } from './api-client';
import { strings } from './strings';

export function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError
    ? `${fallback} (${strings.auth.reference(e.correlationId)})`
    : fallback;
}
