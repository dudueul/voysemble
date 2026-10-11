// Copyright 2026- At Day. All rights reserved.
// Facts about the bounded CSV parser: quoting, BOM, CRLF, limits, partial rejection.

import { describe, expect, it } from 'vitest';
import { CSV_LIMITS, CsvError, parseCsv } from '../src/lib/csv';

describe('parseCsv', () => {
  it('handles BOM, CRLF, quotes with commas and escaped quotes, case-insensitive headers', () => {
    const r = parseCsv('﻿Name,Group\r\n"Lee, Hana",Bus B\r\n"Say ""hi""",Bus A\r\n');
    expect(r.header).toEqual(['name', 'group']);
    expect(r.rows.map((x) => x.values)).toEqual([
      { name: 'Lee, Hana', group: 'Bus B' },
      { name: 'Say "hi"', group: 'Bus A' },
    ]);
  });

  it('rejects an unterminated quote per row and keeps parsing', () => {
    const r = parseCsv('name\n"broken\nfine');
    expect(r.rejected).toEqual([{ line: 2, reason: 'line 2: unterminated quote' }]);
    expect(r.rows.map((x) => x.values.name)).toEqual(['fine']);
  });

  it('throws on missing header, too many rows, and oversized documents', () => {
    expect(() => parseCsv('')).toThrow(CsvError);
    const many = `name\n${'x\n'.repeat(CSV_LIMITS.maxRows + 1)}`;
    expect(() => parseCsv(many)).toThrow(/rows/);
    expect(() => parseCsv('a'.repeat(CSV_LIMITS.maxBytes + 1))).toThrow(/size/);
  });

  it('rejects overlong rows and too many fields without aborting', () => {
    const r = parseCsv(`name\n${'y'.repeat(CSV_LIMITS.maxRowChars + 1)}\nok`);
    expect(r.rejected[0]?.reason).toBe('row too long');
    const fields = Array(CSV_LIMITS.maxFields + 2)
      .fill('v')
      .join(',');
    const r2 = parseCsv(`name\n${fields}\nok`);
    expect(r2.rejected[0]?.reason).toMatch(/fields/);
    expect(r2.rows).toHaveLength(1);
  });
});
