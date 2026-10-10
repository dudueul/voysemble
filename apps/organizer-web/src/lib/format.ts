// Copyright 2026- At Day. All rights reserved.
// Time formatting. Always explicit time zone; never the browser default (doc 01 §13.5).

const timeCache = new Map<string, Intl.DateTimeFormat>();

export function formatTime(iso: string, timeZone: string, locale = 'en-GB'): string {
  const key = `${locale}|${timeZone}`;
  let f = timeCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    });
    timeCache.set(key, f);
  }
  return f.format(new Date(iso));
}

export function formatDayLabel(iso: string, timeZone: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone,
  }).format(new Date(iso));
}

export function formatDateRange(start: string, end: string, locale = 'en-US'): string {
  const f = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${f.format(new Date(`${start}T00:00:00Z`))} – ${f.format(new Date(`${end}T00:00:00Z`))}`;
}

export function minutesBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000);
}

/** "in 22 min" when target is after now, "22 min ago" when before. */
export function relativeTo(nowIso: string, targetIso: string): string {
  const m = minutesBetween(nowIso, targetIso);
  if (Math.abs(m) < 1) return 'now';
  const abs = Math.abs(m);
  const text =
    abs < 60
      ? `${abs} min`
      : abs < 60 * 48
        ? `${Math.round(abs / 60)} h`
        : `${Math.round(abs / 1440)} d`;
  return m > 0 ? `in ${text}` : `${text} ago`;
}

export function tripDayNumber(startDate: string, nowIso: string, timeZone: string): number {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowIso));
  const diff =
    (new Date(`${day}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) /
    86_400_000;
  return Math.floor(diff) + 1;
}
