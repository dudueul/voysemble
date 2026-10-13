#!/usr/bin/env node
// Copyright 2026- At Day. All rights reserved.
//
// Fills the `__BUILD_ID__` and `__D1_ID__` placeholders of a committed wrangler.jsonc for one
// deploy (ADR-0008; docs/runbooks/cloudflare.md §7). The deploy workflow runs it on its own
// checkout, in place, so Wrangler resolves `main`, `assets` and `migrations_dir` from the same
// directory; nobody runs it by hand on a working copy. It refuses values that could break the
// JSON or a hostname, and refuses to leave a placeholder behind.
//
//   node scripts/fill-wrangler.mjs <wrangler.jsonc> --build <id> [--d1 <database id>]
//
// --build: lower-case letters, digits and hyphens (a short commit SHA), 1–40 characters.
// --d1: the Cloudflare D1 database id (a UUID); required when the file carries `__D1_ID__`.

import { readFileSync, writeFileSync } from 'node:fs';

const BUILD_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const D1_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Returns the filled text; throws with a plain reason on a bad value or a placeholder left. */
export function fill(text, { buildId, d1Id }) {
  if (typeof buildId !== 'string' || !BUILD_RE.test(buildId)) {
    throw new Error(
      `build id must be lower-case letters, digits and hyphens: ${JSON.stringify(buildId)}`,
    );
  }
  let out = text.replaceAll('__BUILD_ID__', buildId);
  if (out.includes('__D1_ID__')) {
    if (typeof d1Id !== 'string' || !D1_RE.test(d1Id)) {
      throw new Error('the file needs a D1 database id (a UUID); set the D1_ID_<ENV> variable');
    }
    out = out.replaceAll('__D1_ID__', d1Id);
  }
  const left = out.match(/__[A-Z0-9_]+__/);
  if (left) throw new Error(`placeholder left unfilled: ${left[0]}`);
  return out;
}

function parseArgs(argv) {
  const [file, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (key === '--build') opts.buildId = value;
    else if (key === '--d1') opts.d1Id = value;
    else throw new Error(`unknown option: ${key}`);
  }
  if (!file) throw new Error('usage: fill-wrangler.mjs <wrangler.jsonc> --build <id> [--d1 <id>]');
  return { file, ...opts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { file, buildId, d1Id } = parseArgs(process.argv.slice(2));
    writeFileSync(file, fill(readFileSync(file, 'utf8'), { buildId, d1Id }));
    console.log(`filled ${file} (build ${buildId})`);
  } catch (e) {
    console.error(`fill-wrangler: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
