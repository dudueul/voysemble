// Copyright 2026- At Day. All rights reserved.
// UI strings for the console in the account's language (slice 038): Korean or English, the two
// the product supports. `strings` keeps the shape the pages import (`strings.people.title`, or a
// module-level `const s = strings.people`) but every read resolves against the current table,
// so a language change needs no change in the pages. The choice lives in localStorage, follows
// the account (`/v1/me`), and is set from the top bar; the root remounts on change.

import { useSyncExternalStore } from 'react';
import { en, type Strings } from './strings.en';
import { ko } from './strings.ko';

export type Locale = 'ko' | 'en';
export const LOCALE_KEY = 'voysemble.locale';
const TABLES: Record<Locale, Strings> = { en, ko };

/** The stored choice wins; otherwise the browser's language; English when neither says Korean. */
export function pickInitialLocale(stored: string | null, navigatorLanguage: string): Locale {
  if (stored === 'ko' || stored === 'en') return stored;
  return navigatorLanguage.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

function readStored(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(LOCALE_KEY);
  } catch {
    return null;
  }
}

let current: Locale = pickInitialLocale(
  readStored(),
  typeof navigator === 'undefined' ? 'en' : navigator.language,
);
const listeners = new Set<() => void>();

function applyLang(locale: Locale) {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}
applyLang(current);

export function getLocale(): Locale {
  return current;
}

export function hasStoredLocale(): boolean {
  const v = readStored();
  return v === 'ko' || v === 'en';
}

/** Switch the console's language now; `persist` writes the choice for the next visit. */
export function setLocale(locale: Locale, persist = true): void {
  if (persist) {
    try {
      localStorage.setItem(LOCALE_KEY, locale);
    } catch {
      /* private mode: the choice lasts for this page */
    }
  }
  if (locale === current) return;
  current = locale;
  applyLang(locale);
  for (const fn of listeners) fn();
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The current language, re-rendering the caller when it changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}

export const otherLocale = (locale: Locale): Locale => (locale === 'ko' ? 'en' : 'ko');

/** The label of the language a toggle would switch to, in that language. */
export const localeName: Record<Locale, string> = { ko: '한국어', en: 'English' };

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v);

function resolve(path: string[]): unknown {
  let node: unknown = TABLES[current];
  for (const key of path) {
    if (!isDict(node)) return undefined;
    node = node[key];
  }
  return node;
}

/**
 * A view onto the current table at `path`. Objects come back as nested views (so a page may hold
 * `strings.people` across a language change); strings, functions and arrays come back as they are.
 */
function viewAt(path: string[], shape: Dict): Dict {
  return new Proxy(shape, {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      const value = resolve([...path, key]);
      const example = shape[key];
      return isDict(value) && isDict(example) ? viewAt([...path, key], example) : value;
    },
    has(_target, key) {
      return typeof key === 'string' && key in shape;
    },
    ownKeys() {
      return Object.keys(shape);
    },
    getOwnPropertyDescriptor(_target, key) {
      if (typeof key !== 'string' || !(key in shape)) return undefined;
      const value = resolve([...path, key]);
      const example = shape[key];
      return {
        value: isDict(value) && isDict(example) ? viewAt([...path, key], example) : value,
        enumerable: true,
        configurable: true,
        writable: false,
      };
    },
    set() {
      return false;
    },
  });
}

export const strings: Strings = viewAt([], en as unknown as Dict) as unknown as Strings;

/** Every key of the English table, as dotted paths; the tests check the Korean table has them all. */
export function stringPaths(table: unknown, prefix = ''): string[] {
  if (!isDict(table)) return [prefix];
  return Object.keys(table).flatMap((k) => stringPaths(table[k], prefix ? `${prefix}.${k}` : k));
}

export const stringTables = TABLES;
