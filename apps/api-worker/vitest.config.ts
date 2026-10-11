// Copyright 2026- At Day. All rights reserved.
// Runs tests inside workerd via @cloudflare/vitest-plugin so runtime behavior is real.
// (The former @cloudflare/vitest-pool-workers package is deprecated; this is its successor.)
// D1 migrations are read here and applied per test file by test/setup.ts, so each file starts
// from the deployed schema. Isolated storage gives every test a clean D1/DO/KV.

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations') },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
}));
