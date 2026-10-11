// Copyright 2026- At Day. All rights reserved.
// Facts: the API event maps to the editor shape (null pax → 'all', null end/note omitted) and
// back; a mapped itinerary is live and keeps days, revision, and events.

import type { ItineraryEvent as ApiEvent, Itinerary as ApiItinerary } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { describePatch, fromApiEvent, fromApiItinerary, toApiInput } from './itinerary-api';

const apiEvent: ApiEvent = {
  id: '11111111-1111-4111-8111-111111111111',
  tripId: 'trip_1',
  date: '2026-12-31',
  start: '09:00',
  end: null,
  timeZone: 'Europe/Rome',
  kind: 'activity',
  title: 'Colosseum',
  place: '',
  pax: null,
  status: 'scheduled',
  note: null,
  order: 1,
  published: false,
};

describe('itinerary API mapping', () => {
  it('maps both ways without inventing fields', () => {
    const e = fromApiEvent(apiEvent);
    expect(e.pax).toBe('all');
    expect('end' in e).toBe(false);
    expect('note' in e).toBe(false);
    expect(toApiInput(e)).toEqual({
      date: '2026-12-31',
      start: '09:00',
      end: null,
      timeZone: 'Europe/Rome',
      kind: 'activity',
      title: 'Colosseum',
      place: '',
      pax: null,
      status: 'scheduled',
      note: null,
      order: 1,
    });
    const full = fromApiEvent({ ...apiEvent, end: '11:00', note: 'Bring tickets.', pax: 28 });
    expect(full.end).toBe('11:00');
    expect(full.note).toBe('Bring tickets.');
    expect(toApiInput(full).pax).toBe(28);
  });

  it('itinerary is live with days, revision, and events', () => {
    const it: ApiItinerary = {
      tripId: 'trip_1',
      tripName: 'Tour',
      startDate: '2026-12-26',
      endDate: '2026-12-27',
      revision: 2,
      publishedAt: '2026-10-11T00:00:00.000Z',
      view: 'draft',
      days: [
        { date: '2026-12-26', timeZone: 'Asia/Seoul', label: 'Day 1' },
        { date: '2026-12-27', timeZone: 'Asia/Seoul', label: 'Day 2' },
      ],
      events: [apiEvent],
      unpublished: 1,
    };
    const mapped = fromApiItinerary(it);
    expect(mapped.live).toBe(true);
    expect(mapped.revision).toBe(2);
    expect(mapped.days).toHaveLength(2);
    expect(mapped.events[0]?.id).toBe(apiEvent.id);
  });

  it('describes a proposal patch field by field', () => {
    expect(describePatch({ start: '08:30', note: 'Gate opens early.' })).toBe(
      'start: 08:30 · note: Gate opens early.',
    );
    expect(describePatch({ end: null })).toBe('end: —');
    expect(describePatch({})).toBe('');
  });
});
