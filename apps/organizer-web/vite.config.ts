// Copyright 2026- At Day. All rights reserved.
// Vite build for the organizer console. Output goes to dist/ and is served by apps/api-worker
// through Workers Static Assets (asset-first; /v1/* and /openapi.json hit the Worker).

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
