// Copyright 2026- At Day. All rights reserved.
// Route component: loads the itinerary and seeds the editor reducer, syncing the selected day to
// the URL so a day is linkable. With an organization and a trip (slice 017) the draft comes from
// the API and every edit is saved as it happens: edits debounce per event, moves and additions
// save at once, removals delete at once, and publish sends the expected revision (a stale one
// is a 409 that reloads the server copy). `?state=` and sample mode keep the fixture.

import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Itinerary } from '../../fixtures/itinerary';
import { ApiError } from '../../lib/api-client';
import { DashboardFetchError, type DashboardState } from '../../lib/dashboard-api';
import { fetchItinerary, itineraryApi } from '../../lib/itinerary-api';
import { orgsQuery, pickActiveOrg, tripsQuery } from '../../lib/session';
import { strings } from '../../lib/strings';
import { ItineraryView } from './ItineraryView';
import { type EditorAction, type EditorState, editorReducer, initEditor } from './itinerary-model';

const SAVE_DEBOUNCE_MS = 500;

export function ItineraryPage({
  state,
  day,
  onDayChange,
}: {
  state: DashboardState;
  day?: string;
  onDayChange: (date: string) => void;
}) {
  const orgs = useQuery(orgsQuery);
  const org = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(org?.id ?? ''), enabled: Boolean(org) });
  const trip = trips.data?.[0] ?? null;
  const resolving = orgs.isPending || (org !== null && trips.isPending);
  const useLive = state === 'live' && org !== null && trip !== null;

  const fixture = useQuery({
    queryKey: ['itinerary', state],
    queryFn: () => fetchItinerary(state),
    retry: false,
    staleTime: 60_000,
    enabled: !useLive && !resolving,
  });
  const live = useQuery({
    queryKey: ['itinerary', 'live', org?.id ?? '', trip?.id ?? ''],
    queryFn: () => itineraryApi.get(org?.id ?? '', trip?.id ?? ''),
    retry: false,
    staleTime: 15_000,
    enabled: useLive,
  });
  const q = useLive ? live : fixture;

  if (resolving || q.isPending) return <ItineraryView state={{ kind: 'loading' }} />;
  if (q.isError) {
    const id =
      q.error instanceof DashboardFetchError || q.error instanceof ApiError
        ? q.error.correlationId
        : 'unknown';
    return (
      <ItineraryView state={{ kind: 'error', correlationId: id, retry: () => void q.refetch() }} />
    );
  }
  if (useLive && org && trip) {
    return (
      <LiveEditor
        key={`${org.id}/${trip.id}`}
        orgId={org.id}
        tripId={trip.id}
        itinerary={q.data}
        {...(day ? { day } : {})}
        onDayChange={onDayChange}
      />
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

/** Same reducer, with the API as the side effect of each action. */
function LiveEditor({
  orgId,
  tripId,
  itinerary,
  day,
  onDayChange,
}: {
  orgId: string;
  tripId: string;
  itinerary: Itinerary;
  day?: string;
  onDayChange: (date: string) => void;
}) {
  const [editor, setEditor] = useState<EditorState>(() =>
    initEditor(itinerary, day, () => crypto.randomUUID()),
  );
  const ref = useRef(editor);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((next: EditorState) => {
    ref.current = next;
    setEditor(next);
  }, []);

  const saveEvent = useCallback(
    async (id: string) => {
      const e = ref.current.itinerary.events.find((x) => x.id === id);
      if (!e) return;
      try {
        await itineraryApi.upsert(orgId, tripId, e);
      } catch (err) {
        setNotice(
          err instanceof ApiError
            ? `${strings.itinerary.saveFailed} (${strings.auth.reference(err.correlationId)})`
            : strings.itinerary.saveFailed,
        );
      }
    },
    [orgId, tripId],
  );

  const saveLater = useCallback(
    (id: string) => {
      const pending = timers.current.get(id);
      if (pending) clearTimeout(pending);
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          void saveEvent(id);
        }, SAVE_DEBOUNCE_MS),
      );
    },
    [saveEvent],
  );

  const flush = useCallback(async () => {
    const ids = [...timers.current.keys()];
    for (const t of timers.current.values()) clearTimeout(t);
    timers.current.clear();
    await Promise.all(ids.map((id) => saveEvent(id)));
  }, [saveEvent]);

  const reload = useCallback(async () => {
    try {
      const fresh = await itineraryApi.get(orgId, tripId);
      apply(editorReducer(ref.current, { type: 'load', itinerary: fresh }));
    } catch {
      // The notice already says what went wrong; the next action retries.
    }
  }, [orgId, tripId, apply]);

  const dispatch = useCallback(
    (action: EditorAction) => {
      if (action.type === 'publish') {
        void (async () => {
          await flush();
          try {
            const published = await itineraryApi.publish(
              orgId,
              tripId,
              ref.current.itinerary.revision,
            );
            apply(editorReducer(ref.current, { type: 'publish', revision: published.revision }));
            setNotice(null);
          } catch (err) {
            setNotice(err instanceof ApiError ? err.message : strings.itinerary.publishFailed);
            if (err instanceof ApiError && err.status === 409) await reload();
          }
        })();
        return;
      }
      const before = ref.current;
      const next = editorReducer(before, action);
      apply(next);
      switch (action.type) {
        case 'edit':
          saveLater(action.id);
          break;
        case 'add':
          if (next.selectedEventId) void saveEvent(next.selectedEventId);
          break;
        case 'move': {
          const target = before.itinerary.events.find((e) => e.id === action.id);
          const changed = next.itinerary.events.filter((e) => {
            const was = before.itinerary.events.find((x) => x.id === e.id);
            return was && was.order !== e.order;
          });
          for (const e of changed) void saveEvent(e.id);
          if (!target) break;
          break;
        }
        case 'remove': {
          const pending = timers.current.get(action.id);
          if (pending) clearTimeout(pending);
          timers.current.delete(action.id);
          void itineraryApi.remove(orgId, tripId, action.id).catch((err: unknown) => {
            setNotice(err instanceof ApiError ? err.message : strings.itinerary.saveFailed);
          });
          break;
        }
        default:
          break;
      }
    },
    [apply, flush, orgId, reload, saveEvent, saveLater, tripId],
  );

  useEffect(() => {
    if (editor.selectedDay && editor.selectedDay !== day) onDayChange(editor.selectedDay);
  }, [editor.selectedDay, day, onDayChange]);
  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const h of t.values()) clearTimeout(h);
    };
  }, []);

  return <ItineraryView state={{ kind: 'ready', editor, dispatch, notice }} />;
}
