#!/usr/bin/env node
// Copyright 2026- At Day. All rights reserved.
//
// Header lint. Every source file tracked by git must start with the copyright header
// (after an optional shebang). Policy: docs/engineering/source-headers.md.
// Exit 1 and list offenders when any file lacks it. Exit 0 otherwise.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

export const HEADER_TEXT = 'Copyright 2026- At Day. All rights reserved.';

/** Comment prefix per extension. Files whose extension is absent here are not checked. */
const COMMENT_PREFIX = {
  '.ts': '//',
  '.tsx': '//',
  '.mts': '//',
  '.cts': '//',
  '.js': '//',
  '.mjs': '//',
  '.cjs': '//',
  '.jsx': '//',
  '.kt': '//',
  '.kts': '//',
  '.swift': '//',
  '.jsonc': '//',
  '.css': '/*',
  '.scss': '//',
  '.sql': '--',
  '.sh': '#',
  '.yml': '#',
  '.yaml': '#',
  '.toml': '#',
  '.editorconfig': '#',
  '.gradle': '//',
  '.properties': '#',
};

/** Paths never checked: generated, vendored, or comment-less formats. */
const EXEMPT_BASENAMES = new Set(['pnpm-lock.yaml', 'worker-configuration.d.ts']);
const EXEMPT_PREFIXES = ['node_modules/', 'dist/', '.wrangler/', 'docs/references/'];

export function headerLineFor(ext) {
  const prefix = COMMENT_PREFIX[ext];
  if (!prefix) return null;
  return prefix === '/*' ? `/* ${HEADER_TEXT} */` : `${prefix} ${HEADER_TEXT}`;
}

export function hasHeader(content, ext) {
  const expected = headerLineFor(ext);
  if (!expected) return true;
  const lines = content.split(/\r?\n/, 3);
  const first = lines[0] ?? '';
  const candidate = first.startsWith('#!') ? (lines[1] ?? '') : first;
  return candidate.trim() === expected;
}

export function isChecked(path) {
  if (EXEMPT_BASENAMES.has(basename(path))) return false;
  if (EXEMPT_PREFIXES.some((p) => path.startsWith(p) || path.includes(`/${p}`))) return false;
  const ext = path === '.editorconfig' ? '.editorconfig' : extname(path);
  return Boolean(COMMENT_PREFIX[ext]);
}

export function checkFiles(paths, read = (p) => readFileSync(p, 'utf8')) {
  const offenders = [];
  for (const path of paths) {
    if (!isChecked(path)) continue;
    const ext = path === '.editorconfig' ? '.editorconfig' : extname(path);
    if (!hasHeader(read(path), ext)) offenders.push(path);
  }
  return offenders;
}

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const offenders = checkFiles(trackedFiles());
  if (offenders.length > 0) {
    console.error(`Missing header "${HEADER_TEXT}" in ${offenders.length} file(s):`);
    for (const f of offenders) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log('check:headers ok');
}
