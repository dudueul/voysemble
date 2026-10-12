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

/** The wall-clock of an instant in a zone: { date: "2026-12-31", time: "07:15" }. */
export function localClock(iso: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

function offsetMinutesAt(instantMs: number, timeZone: string): number {
  const { date, time } = localClock(new Date(instantMs).toISOString(), timeZone);
  const wall = Date.parse(`${date}T${time}:00.000Z`);
  return Math.round((wall - instantMs) / 60_000);
}

/** The instant of a wall-clock time in a zone (one correction pass for a daylight-saving day). */
export function zonedToIso(date: string, time: string, timeZone: string): string {
  const guess = Date.parse(`${date}T${time}:00.000Z`);
  let instant = guess - offsetMinutesAt(guess, timeZone) * 60_000;
  const again = offsetMinutesAt(instant, timeZone);
  if (guess - again * 60_000 !== instant) instant = guess - again * 60_000;
  return new Date(instant).toISOString();
}

/** The calendar date `days` after a YYYY-MM-DD date. */
export function plusDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
