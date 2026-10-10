// Copyright 2026- At Day. All rights reserved.
// Facts: edits mark drafts; move swaps order within a day only; add appends to the day; publish bumps
// revision once and clears drafts; publishing with no drafts is a no-op.

import { describe, expect, it } from 'vitest';
import { itineraryFixture } from '../../fixtures/itinerary';
import { draftCount, editorReducer, eventsForDay, initEditor } from './itinerary-model';

const DAY = '2026-12-31';

describe('itinerary editor reducer', () => {
  it('starts on the first day with no drafts', () => {
    const s = initEditor(itineraryFixture);
    expect(s.selectedDay).toBe('2026-12-28');
    expect(draftCount(s)).toBe(0);
    expect(itineraryFixture.days).toHaveLength(13);
  });

  it('edit marks the event as a draft and keeps revision', () => {
    const s0 = initEditor(itineraryFixture, DAY);
    const id = eventsForDay(s0, DAY)[3]?.id as string;
    const s1 = editorReducer(s0, { type: 'edit', id, patch: { title: 'Colosseum tour (early)' } });
    const e = s1.itinerary.events.find((x) => x.id === id);
    expect(e?.title).toBe('Colosseum tour (early)');
    expect(e?.published).toBe(false);
    expect(draftCount(s1)).toBe(1);
    expect(s1.itinerary.revision).toBe(7);
  });

  it('move swaps order with the neighbour and refuses to move past the edges', () => {
    const s0 = initEditor(itineraryFixture, DAY);
    const before = eventsForDay(s0, DAY).map((e) => e.id);
    const s1 = editorReducer(s0, { type: 'move', id: before[1] as string, direction: 'up' });
    const after = eventsForDay(s1, DAY).map((e) => e.id);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
    expect(draftCount(s1)).toBe(2);
    const s2 = editorReducer(s1, { type: 'move', id: after[0] as string, direction: 'up' });
    expect(s2).toBe(s1);
    expect(eventsForDay(s2, '2026-12-30').map((e) => e.id)).toEqual(
      eventsForDay(s0, '2026-12-30').map((e) => e.id),
    );
  });

  it('add appends a draft event to the day and selects it', () => {
    const s0 = initEditor(itineraryFixture, DAY);
    const n = eventsForDay(s0, DAY).length;
    const s1 = editorReducer(s0, { type: 'add', date: DAY });
    const list = eventsForDay(s1, DAY);
    expect(list).toHaveLength(n + 1);
    expect(list[n]?.id).toBe('local_1');
    expect(s1.selectedEventId).toBe('local_1');
    expect(list[n]?.start).toBe('22:00');
  });

  it('publish bumps revision once, clears drafts, and is a no-op without drafts', () => {
    const s0 = initEditor(itineraryFixture, DAY);
    expect(editorReducer(s0, { type: 'publish' })).toBe(s0);
    const id = eventsForDay(s0, DAY)[0]?.id as string;
    const s1 = editorReducer(s0, { type: 'edit', id, patch: { note: 'Room 2' } });
    const s2 = editorReducer(s1, { type: 'publish' });
    expect(s2.itinerary.revision).toBe(8);
    expect(draftCount(s2)).toBe(0);
    expect(s2.itinerary.events.every((e) => e.published)).toBe(true);
  });

  it('removing a published event leaves a tombstone draft', () => {
    const s0 = initEditor(itineraryFixture, DAY);
    const id = eventsForDay(s0, DAY)[0]?.id as string;
    const s1 = editorReducer(s0, { type: 'remove', id });
    expect(eventsForDay(s1, DAY).some((e) => e.id === id)).toBe(false);
    expect(s1.draftIds.has(`removed:${id}`)).toBe(true);
  });
});
