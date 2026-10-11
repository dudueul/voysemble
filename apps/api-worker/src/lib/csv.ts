// Copyright 2026- At Day. All rights reserved.
//
// Bounded CSV parser for roster import (D12, D26). Deliberately small: RFC 4180 quoting, CRLF or
// LF, header row required, hard limits on size, rows, and row length. External input is untrusted
// (doc 00 §"bounded parsers"), so every limit is enforced before allocation grows.

export const CSV_LIMITS = {
  maxBytes: 65_536,
  maxRows: 2000,
  maxRowChars: 2048,
  maxFields: 32,
} as const;

export type CsvRow = Record<string, string>;

export type CsvParseResult = {
  header: string[];
  rows: { line: number; values: CsvRow }[];
  rejected: { line: number; reason: string }[];
};

export class CsvError extends Error {}

function splitLine(line: string, lineNo: number): string[] {
  const fields: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
      if (fields.length > CSV_LIMITS.maxFields) {
        throw new CsvError(`line ${lineNo}: more than ${CSV_LIMITS.maxFields} fields`);
      }
    } else {
      cur += ch;
    }
  }
  if (quoted) throw new CsvError(`line ${lineNo}: unterminated quote`);
  fields.push(cur);
  return fields;
}

/**
 * Parses CSV text into rows keyed by lower-cased, trimmed header names. Rows that fail the
 * per-row limits are listed in `rejected` with the 1-based line number; the parse continues.
 * Whole-document limit violations throw CsvError.
 */
export function parseCsv(text: string): CsvParseResult {
  if (text.length > CSV_LIMITS.maxBytes) throw new CsvError('document exceeds size limit');
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  const lines = body.split(/\r\n|\n|\r/);
  const headerLine = lines[0];
  if (headerLine === undefined || headerLine.trim() === '') {
    throw new CsvError('header row missing');
  }
  const header = splitLine(headerLine, 1).map((h) => h.trim().toLowerCase());
  const rows: CsvParseResult['rows'] = [];
  const rejected: CsvParseResult['rejected'] = [];
  let dataRows = 0;
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const line = i + 1;
    if (raw.trim() === '') continue;
    dataRows++;
    if (dataRows > CSV_LIMITS.maxRows) throw new CsvError(`more than ${CSV_LIMITS.maxRows} rows`);
    if (raw.length > CSV_LIMITS.maxRowChars) {
      rejected.push({ line, reason: 'row too long' });
      continue;
    }
    let fields: string[];
    try {
      fields = splitLine(raw, line);
    } catch (e) {
      rejected.push({ line, reason: e instanceof Error ? e.message : 'unparseable' });
      continue;
    }
    const values: CsvRow = {};
    header.forEach((name, idx) => {
      if (name) values[name] = (fields[idx] ?? '').trim();
    });
    rows.push({ line, values });
  }
  return { header, rows, rejected };
}
