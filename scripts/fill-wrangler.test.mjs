// Copyright 2026- At Day. All rights reserved.
// Tests for the deploy placeholder fill. Run: node --test scripts/

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fill } from './fill-wrangler.mjs';

const D1 = '0f1e2d3c-4b5a-6978-8a9b-acbdcedfe0f1';
const api = readFileSync(new URL('../apps/api-worker/wrangler.jsonc', import.meta.url), 'utf8');
const www = readFileSync(new URL('../apps/public-web/wrangler.jsonc', import.meta.url), 'utf8');

test('fills the API config: every build id and database id, nothing left', () => {
  const out = fill(api, { buildId: 'eb83439', d1Id: D1 });
  assert.equal(out.includes('__'), false);
  assert.match(out, /"BUILD_ID": "eb83439"/);
  assert.match(out, new RegExp(`"database_id": "${D1}"`));
  assert.match(out, /"pattern": "api\.staging\.dev\.voysemble\.cfd"/);
});

test('fills the public site config, which has no database', () => {
  const out = fill(www, { buildId: 'eb83439' });
  assert.match(out, /www\.eb83439\.dev\.voysemble\.cfd/);
});

test('refuses a build id that could break a hostname or the JSON', () => {
  for (const bad of ['', 'EB83439', 'a"b', 'a.b', '-ab', 'ab-', 'a'.repeat(41), undefined]) {
    assert.throws(() => fill(www, { buildId: bad }), /build id/);
  }
});

test('refuses a missing or malformed database id when the file needs one', () => {
  assert.throws(() => fill(api, { buildId: 'eb83439' }), /D1 database id/);
  assert.throws(() => fill(api, { buildId: 'eb83439', d1Id: 'staging' }), /D1 database id/);
});

test('refuses to leave an unknown placeholder', () => {
  assert.throws(() => fill('{"x": "__OTHER__"}', { buildId: 'abc' }), /__OTHER__/);
});

test('the command line fills the file in place and fails without writing on a bad value', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fill-wrangler-'));
  const file = join(dir, 'wrangler.jsonc');
  const script = new URL('./fill-wrangler.mjs', import.meta.url).pathname;
  writeFileSync(file, api);
  assert.throws(() =>
    execFileSync('node', [script, file, '--build', 'eb83439'], { stdio: 'pipe' }),
  );
  assert.equal(readFileSync(file, 'utf8'), api);
  execFileSync('node', [script, file, '--build', 'eb83439', '--d1', D1], { stdio: 'pipe' });
  assert.equal(readFileSync(file, 'utf8'), fill(api, { buildId: 'eb83439', d1Id: D1 }));
});
