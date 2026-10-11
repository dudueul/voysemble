// Copyright 2026- At Day. All rights reserved.
// Fact: trip status in the top bar derives from dates: before start = planning, after end =
// completed, otherwise active.

import { describe, expect, it } from 'vitest';
import { tripStatusOn } from './AppShell';

describe('tripStatusOn', () => {
  const trip = { startsOn: '2026-12-26', endsOn: '2027-01-07' };
  it('classifies by date', () => {
    expect(tripStatusOn(trip, new Date('2026-10-11T00:00:00Z'))).toBe('planning');
    expect(tripStatusOn(trip, new Date('2026-12-26T00:00:00Z'))).toBe('active');
    expect(tripStatusOn(trip, new Date('2027-01-07T23:00:00Z'))).toBe('active');
    expect(tripStatusOn(trip, new Date('2027-01-08T00:00:00Z'))).toBe('completed');
  });
});
