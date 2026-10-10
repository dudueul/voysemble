// Copyright 2026- At Day. All rights reserved.
// Component tests in happy-dom. Browser E2E and screenshots live in playwright.config.ts.

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    css: false,
  },
});
