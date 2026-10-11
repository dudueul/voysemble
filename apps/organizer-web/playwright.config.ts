// Copyright 2026- At Day. All rights reserved.
// Browser E2E against the real API Worker (`wrangler dev`) serving the production build of the
// console: local D1 with migrations applied, local Durable Objects, fixture mailbox. Every spec
// signs in through the magic-link flow first. Screenshots are evidence for the visual-acceptance
// gate (doc 01 §18.4) and are written to docs/captures/web/.

import { defineConfig, devices } from '@playwright/test';

const PORT = 8788;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'Asia/Seoul',
  },
  webServer: {
    // The console must be built first (`pnpm --filter @voysemble/organizer-web build`); the
    // api-worker `pretest`/`predev` hooks do that, CI runs `pnpm test` before `test:e2e`.
    command: `pnpm exec wrangler d1 migrations apply voysemble-local --local && pnpm exec wrangler dev --port ${PORT} --ip 127.0.0.1`,
    cwd: '../api-worker',
    url: `http://127.0.0.1:${PORT}/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
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
