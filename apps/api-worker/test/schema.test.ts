// Copyright 2026- At Day. All rights reserved.
// Fact: every table and column in src/db/schema.ts exists in the applied D1 migrations. Guards
// the hand-written SQL against drifting from the Drizzle schema.

import { env } from 'cloudflare:test';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';

describe('D1 schema', () => {
  it('matches the Drizzle definitions', async () => {
    for (const table of Object.values(schema)) {
      const name = getTableName(table);
      const rows = await env.DB.prepare(`PRAGMA table_info(${name})`).all<{ name: string }>();
      const actual = new Set(rows.results.map((r) => r.name));
      expect(actual.size, `table ${name} exists`).toBeGreaterThan(0);
      for (const col of Object.values(getTableColumns(table))) {
        expect(actual.has(col.name), `${name}.${col.name}`).toBe(true);
      }
    }
  });
});
