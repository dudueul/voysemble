// Copyright 2026- At Day. All rights reserved.
// One QueryClient for the app and the router's beforeLoad guards (they run outside React).

import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) =>
        // Never retry auth/permission failures; retry transient ones once.
        !(err instanceof ApiError && [401, 403, 404, 400, 409].includes(err.status)) && count < 1,
      staleTime: 30_000,
    },
  },
});
