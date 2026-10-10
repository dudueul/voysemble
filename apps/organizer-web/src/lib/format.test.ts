// Copyright 2026- At Day. All rights reserved.
// Facts: times render in the given zone; relative phrasing follows direction; trip day counts from start.

import { describe, expect, it } from 'vitest';
import { formatTime, relativeTo, tripDayNumber } from './format';

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
