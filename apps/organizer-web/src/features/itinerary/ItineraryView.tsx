// Copyright 2026- At Day. All rights reserved.
// Itinerary editor layout: header (revision, drafts, publish) + day rail + day timeline + detail.
// Pure view over EditorState; loading/empty/error handled here for screenshots and tests.

import type { ReactNode } from 'react';
import { Icons } from '../../app/shell/icons';
import { strings } from '../../lib/strings';
import { DayRail } from './DayRail';
import { DayTimeline } from './DayTimeline';
import { EventDetail } from './EventDetail';
import { draftCount, type EditorAction, type EditorState, eventsForDay } from './itinerary-model';

export type ItineraryViewState =
  | { kind: 'loading' }
  | { kind: 'error'; correlationId: string; retry: () => void }
  | {
      kind: 'ready';
      editor: EditorState;
      dispatch: (a: EditorAction) => void;
      /** Live editors report sync problems here (a failed save, a publish conflict). */
      notice?: string | null;
      /** Live editors render the leader proposals panel above the grid (slice 018). */
      proposals?: ReactNode;
      /** Live editors add the notify checkbox and note next to Publish (slice 020). */
      publishControls?: ReactNode;
      /** "Revision n published · 3 changes · travelers notified" after a live publish. */
      status?: string | null;
    };

export function ItineraryView({ state }: { state: ItineraryViewState }) {
  if (state.kind === 'loading') {
    return (
      <main className="page" aria-busy="true" aria-label={strings.states.loading}>
        <div className="skeleton" style={{ width: 280, height: 36 }} />
        <div className="itinerary">
          <div className="skeleton" style={{ height: 520 }} />
          <div className="skeleton" style={{ height: 520 }} />
          <div className="skeleton" style={{ height: 520 }} />
        </div>
      </main>
    );
  }
  if (state.kind === 'error') {
    return (
      <main className="page">
        <section className="card">
          <div className="state" role="alert">
            <span className="state__icon">
              <Icons.alert />
            </span>
            <h2 className="state__title">{strings.states.errorTitle}</h2>
            <p className="state__body">{strings.states.errorBody(state.correlationId)}</p>
            <button type="button" className="btn btn--brand" onClick={state.retry}>
              {strings.states.retry}
            </button>
          </div>
        </section>
      </main>
    );
  }

  const { editor, dispatch } = state;
  const it = editor.itinerary;
  const drafts = draftCount(editor);
  const counts = new Map<string, number>();
  for (const e of it.events) counts.set(e.date, (counts.get(e.date) ?? 0) + 1);
  const day = it.days.find((d) => d.date === editor.selectedDay) ?? null;
  const events = eventsForDay(editor, editor.selectedDay);
  const selected = it.events.find((e) => e.id === editor.selectedEventId) ?? null;

  return (
    <main className="page" aria-labelledby="it-title">
      <div className="page__header">
        <div>
          <h1 className="page__title" id="it-title">
            {strings.itinerary.title}
          </h1>
          <p className="page__subtitle">
            {it.tripName} · {it.startDate} → {it.endDate} · {it.days.length} days
          </p>
        </div>
        <div className="page__meta">
          {it.live ? (
            <span className="chip chip--active">{strings.dashboard.live}</span>
          ) : (
            <span className="chip chip--sample">{strings.dashboard.simulated}</span>
          )}
          <span data-testid="revision">{strings.itinerary.revision(it.revision)}</span>
          <a
            className="btn btn--secondary btn--sm"
            href="/itinerary/history"
            data-testid="history-link"
          >
            {strings.itinerary.history}
          </a>
          <span data-testid="drafts">{strings.itinerary.drafts(drafts)}</span>
          {state.publishControls ?? null}
          <button
            type="button"
            className="btn btn--primary"
            disabled={drafts === 0}
            onClick={() => dispatch({ type: 'publish' })}
          >
            <Icons.check width="16" height="16" />
            {strings.itinerary.publish}
          </button>
        </div>
      </div>

      {state.notice ? (
        <div className="banner" role="alert" data-testid="itinerary-notice">
          <Icons.alert />
          {state.notice}
        </div>
      ) : null}
      {state.status ? (
        <p className="muted small" role="status" data-testid="publish-status">
          {state.status}
        </p>
      ) : null}

      {state.proposals ?? null}

      {it.days.length === 0 ? (
        <section className="card">
          <div className="state" role="status">
            <span className="state__icon">
              <Icons.itinerary />
            </span>
            <h2 className="state__title">{strings.itinerary.emptyTitle}</h2>
            <p className="state__body">{strings.itinerary.emptyBody}</p>
          </div>
        </section>
      ) : (
        <div className="itinerary">
          <DayRail
            days={it.days}
            counts={counts}
            selected={editor.selectedDay}
            onSelect={(date) => dispatch({ type: 'select-day', date })}
          />
          <DayTimeline
            day={day}
            events={events}
            selectedId={editor.selectedEventId}
            dispatch={dispatch}
          />
          <EventDetail event={selected} dispatch={dispatch} />
        </div>
      )}
    </main>
  );
}
