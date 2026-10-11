// Copyright 2026- At Day. All rights reserved.
// Applies the D1 migrations before each test file so the schema matches what wrangler deploys.
// TEST_MIGRATIONS is injected by vitest.config.ts (readD1Migrations) and is not part of Env.

import { applyD1Migrations, env } from 'cloudflare:test';

type Migrations = Parameters<typeof applyD1Migrations>[1];
const testEnv = env as unknown as Env & { TEST_MIGRATIONS: Migrations };

await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
