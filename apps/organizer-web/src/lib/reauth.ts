// Copyright 2026- At Day. All rights reserved.
// Where to return after a step-up confirmation (D35, slice 045). The confirmation link opens in
// a new page, so the page that needed it leaves its path here; the reauth landing page reads it,
// goes there, and clears it. Storage may be blocked (private mode): every call tolerates it.

const KEY = 'voysemble.reauth.next';

export function storeReauthNext(path: string): void {
  try {
    localStorage.setItem(KEY, path);
  } catch {
    /* the landing page falls back to the preparation page */
  }
}

export function takeReauthNext(fallback = '/preparation'): string {
  try {
    const v = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    return v?.startsWith('/') ? v : fallback;
  } catch {
    return fallback;
  }
}
