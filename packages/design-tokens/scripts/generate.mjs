// Copyright 2026- At Day. All rights reserved.
//
// Generates dist/tokens.css, dist/Tokens.kt, dist/Tokens.swift from tokens.json.
// Pure function of the JSON; no network, no env. Idempotent. Run: pnpm --filter @voysemble/design-tokens build

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const HEADER = 'Copyright 2026- At Day. All rights reserved.';
const GENERATED = 'Generated from tokens.json. Do not edit by hand.';

export function loadTokens(path = join(root, 'tokens.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Resolve "{color.neutral.50}" references against the token tree. */
export function resolve(tokens, value) {
  if (typeof value !== 'string') return value;
  const m = /^\{([a-zA-Z0-9.]+)\}$/.exec(value);
  if (!m) return value;
  const out = m[1].split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), tokens);
  if (out === undefined) throw new Error(`Unresolved token reference ${value}`);
  return resolve(tokens, out);
}

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const pascal = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function toCss(t) {
  const lines = [`/* ${HEADER} */`, `/* ${GENERATED} */`, ':root {'];
  for (const [group, vals] of Object.entries(t.color))
    for (const [k, v] of Object.entries(vals))
      lines.push(`  --vy-color-${kebab(group)}-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(t.semantic.light))
    lines.push(`  --vy-${kebab(k)}: ${resolve(t, v)};`);
  for (const [k, v] of Object.entries(t.space)) lines.push(`  --vy-space-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(t.radius)) lines.push(`  --vy-radius-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(t.type)) {
    lines.push(`  --vy-type-${k}-size: ${v.size}px;`);
    lines.push(`  --vy-type-${k}-line: ${v.lineHeight}px;`);
    lines.push(`  --vy-type-${k}-weight: ${v.weight};`);
  }
  lines.push(`  --vy-touch-min: ${t.touchTarget.min}px;`);
  for (const [k, v] of Object.entries(t.elevation)) lines.push(`  --vy-elevation-${k}: ${v};`);
  lines.push('}', '');
  lines.push('@media (prefers-color-scheme: dark) {', '  :root:not([data-theme="light"]) {');
  for (const [k, v] of Object.entries(t.semantic.dark))
    lines.push(`    --vy-${kebab(k)}: ${resolve(t, v)};`);
  lines.push('  }', '}', '');
  lines.push(':root[data-theme="dark"] {');
  for (const [k, v] of Object.entries(t.semantic.dark))
    lines.push(`  --vy-${kebab(k)}: ${resolve(t, v)};`);
  lines.push('}', '');
  return lines.join('\n');
}

const hexToArgbLong = (hex) => `0xFF${hex.slice(1).toUpperCase()}`;

export function toKotlin(t) {
  const l = [
    `// ${HEADER}`,
    `// ${GENERATED}`,
    'package com.voysemble.design',
    '',
    'object Tokens {',
  ];
  l.push('    object Color {');
  for (const [group, vals] of Object.entries(t.color)) {
    l.push(`        object ${pascal(group)} {`);
    for (const [k, v] of Object.entries(vals))
      l.push(
        `            const val ${/^\d/.test(k) ? `N${k}` : pascal(k)}: Long = ${hexToArgbLong(v)}`,
      );
    l.push('        }');
  }
  for (const scheme of ['light', 'dark']) {
    l.push(`        object ${pascal(scheme)} {`);
    for (const [k, v] of Object.entries(t.semantic[scheme]))
      l.push(`            const val ${pascal(k)}: Long = ${hexToArgbLong(resolve(t, v))}`);
    l.push('        }');
  }
  l.push('    }');
  l.push('    object Space {');
  for (const [k, v] of Object.entries(t.space)) l.push(`        const val S${k}: Int = ${v}`);
  l.push('    }', '    object Radius {');
  for (const [k, v] of Object.entries(t.radius))
    l.push(`        const val ${pascal(k)}: Int = ${v}`);
  l.push('    }', '    object Type {');
  for (const [k, v] of Object.entries(t.type))
    l.push(
      `        object ${pascal(k)} { const val size: Int = ${v.size}; const val lineHeight: Int = ${v.lineHeight}; const val weight: Int = ${v.weight} }`,
    );
  l.push('    }', `    const val TouchTargetMin: Int = ${t.touchTarget.min}`, '}', '');
  return l.join('\n');
}

export function toSwift(t) {
  const l = [`// ${HEADER}`, `// ${GENERATED}`, 'import Foundation', '', 'public enum Tokens {'];
  l.push('    public enum Color {');
  for (const [group, vals] of Object.entries(t.color)) {
    l.push(`        public enum ${pascal(group)} {`);
    for (const [k, v] of Object.entries(vals))
      l.push(
        `            public static let ${/^\d/.test(k) ? `n${k}` : k}: UInt32 = ${hexToArgbLong(v)}`,
      );
    l.push('        }');
  }
  for (const scheme of ['light', 'dark']) {
    l.push(`        public enum ${pascal(scheme)} {`);
    for (const [k, v] of Object.entries(t.semantic[scheme]))
      l.push(`            public static let ${k}: UInt32 = ${hexToArgbLong(resolve(t, v))}`);
    l.push('        }');
  }
  l.push('    }', '    public enum Space {');
  for (const [k, v] of Object.entries(t.space))
    l.push(`        public static let s${k}: CGFloat = ${v}`);
  l.push('    }', '    public enum Radius {');
  for (const [k, v] of Object.entries(t.radius))
    l.push(`        public static let ${k}: CGFloat = ${v}`);
  l.push('    }', '    public enum Type {');
  for (const [k, v] of Object.entries(t.type))
    l.push(
      `        public enum ${k} { public static let size: CGFloat = ${v.size}; public static let lineHeight: CGFloat = ${v.lineHeight}; public static let weight: Int = ${v.weight} }`,
    );
  l.push('    }', `    public static let touchTargetMin: CGFloat = ${t.touchTarget.min}`, '}', '');
  return l.join('\n');
}

export function generate(outDir = join(root, 'dist')) {
  const t = loadTokens();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'tokens.css'), toCss(t));
  writeFileSync(join(outDir, 'Tokens.kt'), toKotlin(t));
  writeFileSync(join(outDir, 'Tokens.swift'), toSwift(t));
  return outDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`design-tokens generated into ${generate()}`);
}
