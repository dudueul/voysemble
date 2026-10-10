// Copyright 2026- At Day. All rights reserved.
// Runs tests inside workerd via @cloudflare/vitest-plugin so runtime behavior is real.
// (The former @cloudflare/vitest-pool-workers package is deprecated; this is its successor.)

import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
