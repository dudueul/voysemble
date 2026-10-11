// Copyright 2026- At Day. All rights reserved.
//
// Editor state for the itinerary: pure reducer, no I/O. Owns: selection, draft edits, reorder,
// add, publish (revision bump). Later slices send the draft diff to the API with the expected
// revision (doc 01 §11.3); the reducer shape is designed for that diff.

import type { EventKind, EventStatus, Itinerary, ItineraryEvent } from '../../fixtures/itinerary';

export interface EditorState {
  itinerary: Itinerary;
  selectedDay: string | null;
  selectedEventId: string | null;
  /** Ids changed since the last publish. */
  draftIds: ReadonlySet<string>;
  /** Monotonic counter for new local ids. */
  nextLocalId: number;
  /** Live editors mint server-ready ids (UUID); the fixture editor uses `local_n`. */
  makeId?: (n: number) => string;
}

/** Keys set to `undefined` are cleared on the event (e.g. remove the end time). */
export type EventPatch = {
  title?: string;
  place?: string;
  start?: string;
  end?: string | undefined;
  kind?: EventKind;
  status?: EventStatus;
  note?: string | undefined;
  pax?: number | 'all';
};

export type EditorAction =
  | { type: 'select-day'; date: string }
  | { type: 'select-event'; id: string | null }
  | { type: 'edit'; id: string; patch: EventPatch }
  | { type: 'move'; id: string; direction: 'up' | 'down' }
  | { type: 'add'; date: string }
  | { type: 'remove'; id: string }
  /** Local publish bumps by one; a live publish carries the server's revision. */
  | { type: 'publish'; revision?: number }
  /** Replace everything with a fresh server copy (after a conflict or a reload). */
  | { type: 'load'; itinerary: Itinerary };

export function initEditor(
  itinerary: Itinerary,
  selectedDay?: string,
  makeId?: (n: number) => string,
): EditorState {
  const day =
    selectedDay && itinerary.days.some((d) => d.date === selectedDay)
      ? selectedDay
      : (itinerary.days[0]?.date ?? null);
  return {
    itinerary,
    selectedDay: day,
    selectedEventId: null,
    draftIds: new Set(),
    nextLocalId: 1,
    ...(makeId ? { makeId } : {}),
  };
}

export function eventsForDay(state: EditorState, date: string | null): ItineraryEvent[] {
  if (!date) return [];
  return state.itinerary.events.filter((e) => e.date === date).sort((a, b) => a.order - b.order);
}

export function draftCount(state: EditorState): number {
  return state.draftIds.size;
}

const withDraft = (set: ReadonlySet<string>, id: string) => new Set([...set, id]);

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'select-day':
      return { ...state, selectedDay: action.date, selectedEventId: null };
    case 'select-event':
      return { ...state, selectedEventId: action.id };
    case 'edit': {
      const events = state.itinerary.events.map((e) =>
        e.id === action.id ? applyPatch(e, action.patch) : e,
      );
      return {
        ...state,
        itinerary: { ...state.itinerary, events },
        draftIds: withDraft(state.draftIds, action.id),
      };
    }
    case 'move': {
      const target = state.itinerary.events.find((e) => e.id === action.id);
      if (!target) return state;
      const siblings = eventsForDay(state, target.date);
      const i = siblings.findIndex((e) => e.id === action.id);
      const j = action.direction === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= siblings.length) return state;
      const a = siblings[i] as ItineraryEvent;
      const b = siblings[j] as ItineraryEvent;
      const events = state.itinerary.events.map((e) => {
        if (e.id === a.id) return { ...e, order: b.order, published: false };
        if (e.id === b.id) return { ...e, order: a.order, published: false };
        return e;
      });
      return {
        ...state,
        itinerary: { ...state.itinerary, events },
        draftIds: new Set([...state.draftIds, a.id, b.id]),
      };
    }
    case 'add': {
      const day = state.itinerary.days.find((d) => d.date === action.date);
      if (!day) return state;
      const siblings = eventsForDay(state, action.date);
      const last = siblings[siblings.length - 1];
      const id = state.makeId ? state.makeId(state.nextLocalId) : `local_${state.nextLocalId}`;
      const created: ItineraryEvent = {
        id,
        tripId: state.itinerary.tripId,
        date: action.date,
        start: last?.end ?? last?.start ?? '09:00',
        timeZone: day.timeZone,
        kind: 'activity',
        title: 'New event',
        place: '',
        pax: 'all',
        status: 'scheduled',
        order: (last?.order ?? 0) + 1,
        published: false,
      };
      return {
        ...state,
        itinerary: { ...state.itinerary, events: [...state.itinerary.events, created] },
        selectedEventId: id,
        draftIds: withDraft(state.draftIds, id),
        nextLocalId: state.nextLocalId + 1,
      };
    }
    case 'remove': {
      const events = state.itinerary.events.filter((e) => e.id !== action.id);
      const draftIds = new Set(state.draftIds);
      draftIds.delete(action.id);
      // Removal of a published event is itself a draft change; track it under a tombstone id.
      if (state.itinerary.events.some((e) => e.id === action.id && e.published))
        draftIds.add(`removed:${action.id}`);
      return {
        ...state,
        itinerary: { ...state.itinerary, events },
        selectedEventId: state.selectedEventId === action.id ? null : state.selectedEventId,
        draftIds,
      };
    }
    case 'publish': {
      if (state.draftIds.size === 0 && action.revision === undefined) return state;
      const events = state.itinerary.events.map((e) =>
        e.published ? e : { ...e, published: true },
      );
      return {
        ...state,
        itinerary: {
          ...state.itinerary,
          revision: action.revision ?? state.itinerary.revision + 1,
          events,
        },
        draftIds: new Set(),
      };
    }
    case 'load': {
      const stillThere = action.itinerary.days.some((d) => d.date === state.selectedDay);
      return {
        ...state,
        itinerary: action.itinerary,
        selectedDay: stillThere ? state.selectedDay : (action.itinerary.days[0]?.date ?? null),
        selectedEventId: action.itinerary.events.some((e) => e.id === state.selectedEventId)
          ? state.selectedEventId
          : null,
        draftIds: new Set(),
      };
    }
    default:
      return state;
  }
}

function applyPatch(e: ItineraryEvent, patch: EventPatch): ItineraryEvent {
  const next: Record<string, unknown> = { ...e, published: false };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return next as unknown as ItineraryEvent;
}

export const KINDS: EventKind[] = ['flight', 'bus', 'meal', 'activity', 'hotel', 'meeting', 'free'];
export const STATUSES: EventStatus[] = ['scheduled', 'in_progress', 'done', 'delayed', 'cancelled'];
