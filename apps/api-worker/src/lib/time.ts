// Copyright 2026- At Day. All rights reserved.
//
// Clock helpers. All persisted timestamps are RFC 3339 UTC strings produced here, so tests can
// compare them lexicographically and the schema stays text-only.

export function nowIso(): string {
  return new Date().toISOString();
}

export function plusSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

export function isPast(iso: string, now = nowIso()): boolean {
  return iso <= now;
}

export const SECONDS = { minute: 60, hour: 3600, day: 86_400 } as const;
