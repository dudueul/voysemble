// Copyright 2026- At Day. All rights reserved.
// Unit tests for the pure renderers and the content model (no browser, no network).

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
