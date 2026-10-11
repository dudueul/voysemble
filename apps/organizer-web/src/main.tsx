// Copyright 2026- At Day. All rights reserved.
// Entry: React 19 root, TanStack Query client, router. No analytics, no third-party scripts.

import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@voysemble/design-tokens/dist/tokens.css';
import './app/styles/base.css';
import { router } from './app/router';
import { queryClient } from './lib/query-client';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
