// Copyright 2026- At Day. All rights reserved.
// Browser E2E against `vite preview` of the production build. Screenshots are evidence for the
// visual-acceptance gate (doc 01 §18.4) and are written to docs/captures/web/.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'Asia/Seoul',
  },
  webServer: {
    command: 'pnpm exec vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
    {
      name: 'laptop-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
