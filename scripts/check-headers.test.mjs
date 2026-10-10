// Copyright 2026- At Day. All rights reserved.
// Tests for the header lint. Run: node --test scripts/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkFiles, hasHeader, isChecked } from './check-headers.mjs';

test('accepts a TypeScript file whose first line is the header', () => {
  assert.equal(
    hasHeader('// Copyright 2026- At Day. All rights reserved.\nexport {};\n', '.ts'),
    true,
  );
});

test('accepts a shebang followed by the header', () => {
  assert.equal(
    hasHeader('#!/usr/bin/env node\n// Copyright 2026- At Day. All rights reserved.\n', '.mjs'),
    true,
  );
});

test('rejects a file with a wrong year or missing header', () => {
  assert.equal(hasHeader('// Copyright 2025 At Day. All rights reserved.\n', '.ts'), false);
  assert.equal(hasHeader('export {};\n', '.ts'), false);
});

test('CSS uses block comment form', () => {
  assert.equal(
    hasHeader('/* Copyright 2026- At Day. All rights reserved. */\n:root{}', '.css'),
    true,
  );
});

test('JSON, markdown, lockfile, generated and reference files are exempt', () => {
  assert.equal(isChecked('package.json'), false);
  assert.equal(isChecked('README.md'), false);
  assert.equal(isChecked('pnpm-lock.yaml'), false);
  assert.equal(isChecked('apps/api-worker/worker-configuration.d.ts'), false);
  assert.equal(isChecked('docs/references/00_travel-agency-like.md'), false);
  assert.equal(isChecked('apps/api-worker/src/index.ts'), true);
});

test('checkFiles lists only offenders', () => {
  const files = {
    'a.ts': '// Copyright 2026- At Day. All rights reserved.\n',
    'b.ts': 'x',
    'c.json': '{}',
  };
  assert.deepEqual(
    checkFiles(Object.keys(files), (p) => files[p]),
    ['b.ts'],
  );
});
