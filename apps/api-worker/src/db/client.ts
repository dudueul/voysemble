// Copyright 2026- At Day. All rights reserved.
//
// Drizzle handle over the D1 binding. One per request; D1 has no connection state to pool.

import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function db(binding: D1Database) {
  return drizzle(binding, { schema });
}
export type Db = ReturnType<typeof db>;
