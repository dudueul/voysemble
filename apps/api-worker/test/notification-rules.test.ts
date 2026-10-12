// Copyright 2026- At Day. All rights reserved.
// Facts (D29, slice 052): the lane per role and kind; quiet hours that cross midnight; the normal
// lane held until quiet hours end (today or tomorrow); the digest lane at the digest hour, today
// while it is ahead, else tomorrow; the priority lane never waits.

import { describe, expect, it } from 'vitest';
import { deliverAt, inQuietHours, laneFor } from '../src/lib/notification-rules';
import { localClock, zonedToIso } from '../src/lib/time';

describe('notification lanes', () => {
  it('give each role its lane per kind', () => {
    expect(laneFor('traveler', 'announcement', { requiresAck: true })).toBe('priority');
    expect(laneFor('traveler', 'announcement', { requiresAck: false })).toBe('normal');
    expect(laneFor('traveler', 'headcount_call')).toBe('priority');
    expect(laneFor('traveler', 'incident_status')).toBeNull();
    expect(laneFor('traveler', 'proposal_decided')).toBeNull();
    expect(laneFor('traveler', 'itinerary_revision')).toBe('normal');
    expect(laneFor('guardian', 'incident_status')).toBe('priority');
    expect(laneFor('guardian', 'announcement', { sharedWithGuardians: true })).toBe('normal');
    expect(laneFor('guardian', 'announcement', { sharedWithGuardians: false })).toBeNull();
    expect(laneFor('guardian', 'itinerary_revision', { sharedWithGuardians: true })).toBe('digest');
    expect(laneFor('guardian', 'headcount_call')).toBeNull();
    expect(laneFor('leader', 'headcount_call')).toBe('priority');
    expect(laneFor('leader', 'incident_status')).toBe('priority');
    expect(laneFor('leader', 'proposal_decided')).toBe('priority');
    expect(laneFor('leader', 'announcement', { requiresAck: true })).toBe('normal');
  });

  it('know quiet hours, also across midnight', () => {
    const night = { from: '23:00', to: '06:30' };
    expect(inQuietHours('23:00', night)).toBe(true);
    expect(inQuietHours('02:15', night)).toBe(true);
    expect(inQuietHours('06:29', night)).toBe(true);
    expect(inQuietHours('06:30', night)).toBe(false);
    expect(inQuietHours('12:00', night)).toBe(false);
    const nap = { from: '13:00', to: '14:00' };
    expect(inQuietHours('13:30', nap)).toBe(true);
    expect(inQuietHours('14:00', nap)).toBe(false);
    expect(inQuietHours('13:30', { from: '09:00', to: '09:00' })).toBe(false);
  });

  it('deliver now, at the end of quiet hours, or at the digest hour', () => {
    const night = { from: '23:00', to: '06:30' };
    // 2026-12-31 07:12 in Rome: daytime.
    const day = '2026-12-31T06:12:00.000Z';
    expect(deliverAt('priority', day, 'Europe/Rome', night, '19:00')).toBe(day);
    expect(deliverAt('normal', day, 'Europe/Rome', night, '19:00')).toBe(day);
    expect(deliverAt('digest', day, 'Europe/Rome', night, '19:00')).toBe(
      '2026-12-31T18:00:00.000Z',
    );
    // 2026-12-31 23:40 in Rome: quiet; the normal lane waits for 06:30 the next morning.
    const late = '2026-12-31T22:40:00.000Z';
    expect(deliverAt('priority', late, 'Europe/Rome', night, '19:00')).toBe(late);
    expect(deliverAt('normal', late, 'Europe/Rome', night, '19:00')).toBe(
      '2027-01-01T05:30:00.000Z',
    );
    expect(deliverAt('digest', late, 'Europe/Rome', night, '19:00')).toBe(
      '2027-01-01T18:00:00.000Z',
    );
    // 2027-01-01 02:00 in Rome: still quiet; the same morning.
    const small = '2027-01-01T01:00:00.000Z';
    expect(deliverAt('normal', small, 'Europe/Rome', night, '19:00')).toBe(
      '2027-01-01T05:30:00.000Z',
    );
    // A daytime quiet window that does not cross midnight.
    expect(
      deliverAt(
        'normal',
        '2026-12-31T12:30:00.000Z',
        'Europe/Rome',
        { from: '13:00', to: '14:00' },
        '19:00',
      ),
    ).toBe('2026-12-31T13:00:00.000Z');
  });

  it('read and write wall-clock times in a zone', () => {
    expect(localClock('2026-12-31T06:12:00.000Z', 'Europe/Rome')).toEqual({
      date: '2026-12-31',
      time: '07:12',
    });
    expect(localClock('2026-12-31T22:40:00.000Z', 'Asia/Seoul')).toEqual({
      date: '2027-01-01',
      time: '07:40',
    });
    expect(zonedToIso('2026-07-01', '09:00', 'Europe/Rome')).toBe('2026-07-01T07:00:00.000Z');
  });
});
