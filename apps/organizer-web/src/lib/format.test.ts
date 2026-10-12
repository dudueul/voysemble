// Copyright 2026- At Day. All rights reserved.
// Facts: times render in the given zone; relative phrasing follows direction; trip day counts from start.

import { describe, expect, it } from 'vitest';
import { formatTime, relativeTo, tripDayNumber, zonedToIso } from './format';

describe('format', () => {
  it('formatTime uses the explicit zone', () => {
    expect(formatTime('2026-12-31T06:12:00Z', 'Europe/Rome')).toBe('07:12');
    expect(formatTime('2026-12-31T06:12:00Z', 'Asia/Seoul')).toBe('15:12');
  });
  it('relativeTo says ago for the past and in for the future', () => {
    expect(relativeTo('2026-12-31T06:12:00Z', '2026-12-31T05:50:00Z')).toBe('22 min ago');
    expect(relativeTo('2026-12-31T06:12:00Z', '2026-12-31T08:12:00Z')).toBe('in 2 h');
    expect(relativeTo('2026-12-31T06:12:00Z', '2026-12-31T06:12:20Z')).toBe('now');
  });
  it('tripDayNumber is 4 on Dec 31 for a Dec 28 start in Rome', () => {
    expect(tripDayNumber('2026-12-28', '2026-12-31T06:12:00Z', 'Europe/Rome')).toBe(4);
  });
});

describe('zonedToIso (slice 050)', () => {
  it('turns a wall-clock time in a zone into the instant', () => {
    expect(zonedToIso('2026-12-31', '07:15', 'Europe/Rome')).toBe('2026-12-31T06:15:00.000Z');
    expect(zonedToIso('2026-12-31', '07:15', 'Asia/Seoul')).toBe('2026-12-30T22:15:00.000Z');
    // Summer time in Rome is two hours ahead.
    expect(zonedToIso('2026-07-01', '09:00', 'Europe/Rome')).toBe('2026-07-01T07:00:00.000Z');
    expect(zonedToIso('2026-12-31', '00:00', 'UTC')).toBe('2026-12-31T00:00:00.000Z');
  });
});
