// Copyright 2026- At Day. All rights reserved.
// Facts: references resolve, each target contains brand blue and the dark override, outputs carry the header.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTokens, resolve, toCss, toKotlin, toSwift } from '../scripts/generate.mjs';

const t = loadTokens();

test('semantic references resolve to hex', () => {
  assert.equal(resolve(t, '{color.brand.voyBlue}'), '#2563EB');
  assert.equal(resolve(t, t.semantic.light.action), '#166534');
});

test('unresolved reference throws', () => {
  assert.throws(() => resolve(t, '{color.nope.x}'), /Unresolved/);
});

test('css output has header, brand var, semantic var, dark override', () => {
  const css = toCss(t);
  assert.ok(css.startsWith('/* Copyright 2026- At Day. All rights reserved. */'));
  assert.match(css, /--vy-color-brand-voy-blue: #2563EB;/);
  assert.match(css, /--vy-action: #166534;/);
  assert.match(css, /:root\[data-theme="dark"\]/);
});

test('kotlin and swift outputs have header and ARGB literals', () => {
  const kt = toKotlin(t);
  const sw = toSwift(t);
  assert.ok(kt.startsWith('// Copyright 2026- At Day. All rights reserved.'));
  assert.ok(sw.startsWith('// Copyright 2026- At Day. All rights reserved.'));
  assert.match(kt, /const val VoyBlue: Long = 0xFF2563EB/);
  assert.match(sw, /public static let voyBlue: UInt32 = 0xFF2563EB/);
});
