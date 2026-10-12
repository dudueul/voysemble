// Copyright 2026- At Day. All rights reserved.
// Facts (slice 063): without a choice the active trip is the one on today, else the next to
// start, else the one that ended last; a remembered choice wins while it is still one of the
// organization's trips and is forgotten when it is not; the choice is per organization; a write
// reaches every subscriber, so a mounted page re-renders with the new trip.

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultTrip,
  pickActiveTrip,
  readActiveTripId,
  subscribeActiveTrip,
  useActiveTrip,
  writeActiveTripId,
} from './session';

const winter = { id: 'tr_winter', name: 'Winter', startsOn: '2026-12-26', endsOn: '2027-01-07' };
const spring = { id: 'tr_spring', name: 'Spring', startsOn: '2027-03-20', endsOn: '2027-03-27' };
const past = { id: 'tr_past', name: 'Past', startsOn: '2026-05-01', endsOn: '2026-05-05' };
const older = { id: 'tr_older', name: 'Older', startsOn: '2025-05-01', endsOn: '2025-05-05' };

beforeEach(() => {
  localStorage.clear();
});

describe('defaultTrip', () => {
  it('prefers the trip on today, then the next to start, then the one that ended last', () => {
    expect(defaultTrip([spring, winter, past], '2026-12-30')?.id).toBe('tr_winter');
    expect(defaultTrip([spring, winter, past], '2026-10-12')?.id).toBe('tr_winter');
    expect(defaultTrip([spring, winter, past], '2027-02-01')?.id).toBe('tr_spring');
    expect(defaultTrip([older, past], '2027-02-01')?.id).toBe('tr_past');
    expect(defaultTrip([], '2027-02-01')).toBeNull();
  });
});

describe('pickActiveTrip', () => {
  it('keeps a remembered trip of the organization and forgets one that is gone', () => {
    const today = '2026-10-12';
    expect(pickActiveTrip('org_1', [winter, spring], today)?.id).toBe('tr_winter');
    writeActiveTripId('org_1', 'tr_spring');
    expect(pickActiveTrip('org_1', [winter, spring], today)?.id).toBe('tr_spring');
    // Another organization has its own choice.
    expect(pickActiveTrip('org_2', [winter, spring], today)?.id).toBe('tr_winter');
    // The remembered trip was deleted: the default again.
    expect(pickActiveTrip('org_1', [winter], today)?.id).toBe('tr_winter');
    expect(pickActiveTrip('org_1', undefined, today)).toBeNull();
    expect(readActiveTripId('org_1')).toBe('tr_spring');
  });
});

describe('useActiveTrip', () => {
  it('follows a switch from anywhere', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActiveTrip(listener);
    const { result } = renderHook(() => useActiveTrip('org_1', [winter, spring]));
    expect(result.current?.id).toBe('tr_winter');
    act(() => writeActiveTripId('org_1', 'tr_spring'));
    expect(result.current?.id).toBe('tr_spring');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    act(() => writeActiveTripId('org_1', 'tr_winter'));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(result.current?.id).toBe('tr_winter');
  });
});
