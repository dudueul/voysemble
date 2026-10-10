// Copyright 2026- At Day. All rights reserved.
// Route component: loads the itinerary (fixture), seeds the editor reducer, syncs selected day
// to the URL so a day is linkable.

import { useQuery } from '@tanstack/react-query';
import { useEffect, useReducer } from 'react';
import type { Itinerary } from '../../fixtures/itinerary';
import { DashboardFetchError, type DashboardState } from '../../lib/dashboard-api';
import { fetchItinerary } from '../../lib/itinerary-api';
import { ItineraryView } from './ItineraryView';
import { editorReducer, initEditor } from './itinerary-model';

export function ItineraryPage({
  state,
  day,
  onDayChange,
}: {
  state: DashboardState;
  day?: string;
  onDayChange: (date: string) => void;
}) {
  const q = useQuery({
    queryKey: ['itinerary', state],
    queryFn: () => fetchItinerary(state),
    retry: false,
    staleTime: 60_000,
  });
  if (q.isPending) return <ItineraryView state={{ kind: 'loading' }} />;
  if (q.isError) {
    const id = q.error instanceof DashboardFetchError ? q.error.correlationId : 'unknown';
    return (
      <ItineraryView state={{ kind: 'error', correlationId: id, retry: () => void q.refetch() }} />
    );
  }
  return <Editor itinerary={q.data} {...(day ? { day } : {})} onDayChange={onDayChange} />;
}

function Editor({
  itinerary,
  day,
  onDayChange,
}: {
  itinerary: Itinerary;
  day?: string;
  onDayChange: (date: string) => void;
}) {
  const [editor, dispatch] = useReducer(editorReducer, itinerary, (it) => initEditor(it, day));
  useEffect(() => {
    if (editor.selectedDay && editor.selectedDay !== day) onDayChange(editor.selectedDay);
  }, [editor.selectedDay, day, onDayChange]);
  return <ItineraryView state={{ kind: 'ready', editor, dispatch }} />;
}
