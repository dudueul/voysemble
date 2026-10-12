// Copyright 2026- At Day. All rights reserved.
// Facts (slice 038): the Korean table has every key of the English one (and nothing else), with
// the same kinds of values (text, function, object); the shared view resolves against the current
// language and a section held across a switch follows it; the initial choice prefers the stored
// value, then the browser language.

import { afterEach, describe, expect, it } from 'vitest';
import {
  getLocale,
  pickInitialLocale,
  setLocale,
  stringPaths,
  strings,
  stringTables,
} from './strings';

afterEach(() => setLocale('en'));

const kindOf = (v: unknown) => (typeof v === 'function' ? 'fn' : typeof v);

function leafKinds(table: unknown, prefix = ''): Record<string, string> {
  if (typeof table !== 'object' || table === null || Array.isArray(table)) {
    return { [prefix]: kindOf(table) };
  }
  return Object.assign(
    {},
    ...Object.entries(table).map(([k, v]) => leafKinds(v, prefix ? `${prefix}.${k}` : k)),
  );
}

describe('strings tables', () => {
  it('ko mirrors en key for key with the same value kinds', () => {
    const enPaths = stringPaths(stringTables.en).sort();
    const koPaths = stringPaths(stringTables.ko).sort();
    expect(koPaths).toEqual(enPaths);
    expect(leafKinds(stringTables.ko)).toEqual(leafKinds(stringTables.en));
    expect(enPaths.length).toBeGreaterThan(300);
  });

  it('no Korean leaf is left in English (except product names and symbols)', () => {
    const same = stringPaths(stringTables.en).filter((p) => {
      const a = p
        .split('.')
        .reduce<unknown>((n, k) => (n as Record<string, unknown>)[k], stringTables.en);
      const b = p
        .split('.')
        .reduce<unknown>((n, k) => (n as Record<string, unknown>)[k], stringTables.ko);
      return typeof a === 'string' && a === b && /[A-Za-z]{4,}/.test(a);
    });
    // Product names, codes and CSV headers are the same in both languages by design.
    expect(same).toEqual(['app.name', 'reports.csvHeader']);
  });
});

describe('the shared view', () => {
  it('resolves against the current language, also for a section held across the switch', () => {
    const people = strings.people;
    expect(getLocale()).toBe('en');
    expect(strings.nav.people).toBe('People');
    expect(people.colName).toBe('Name');
    setLocale('ko');
    expect(strings.nav.people).toBe('사람');
    expect(people.colName).toBe('이름');
    expect(strings.people.status.joined).toBe('참여함');
    expect(strings.dashboard.subtitle(4, '투어')).toBe('투어 · 4일차');
    expect(Object.keys(strings.kind)).toEqual(Object.keys(stringTables.en.kind));
    expect(strings.settings.role.owner).toBe('소유자');
  });

  it('picks the stored language first, then the browser language', () => {
    expect(pickInitialLocale('ko', 'en-US')).toBe('ko');
    expect(pickInitialLocale('en', 'ko-KR')).toBe('en');
    expect(pickInitialLocale(null, 'ko-KR')).toBe('ko');
    expect(pickInitialLocale('xx', 'fr-FR')).toBe('en');
  });
});
