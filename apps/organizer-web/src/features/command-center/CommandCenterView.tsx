// Copyright 2026- At Day. All rights reserved.
//
// Command center (mobile "Today" counterpart for organizers). Pure view: takes a discriminated
// state and renders loading / empty / error / offline / success. No data fetching here, so
// every state is unit-testable and screenshot-able. `data.live` (slice 014) swaps the
// "Sample data" chip for "Live"; panels render their own empty lines when the API has nothing.

import { Icons } from '../../app/shell/icons';
import type { Dashboard, Trip } from '../../fixtures/korea-concert-tour';
import { formatTime, relativeTo, tripDayNumber } from '../../lib/format';
import { strings } from '../../lib/strings';
import { AlertsPanel } from './AlertsPanel';
import { Announcements } from './Announcements';
import { HeadcountPanel } from './HeadcountPanel';
import { MovementsPanel } from './MovementsPanel';
import { StatTiles } from './StatTiles';
import { TripsPanel } from './TripsPanel';

export type CommandCenterState =
  | { kind: 'loading' }
  | { kind: 'error'; correlationId: string; retry: () => void }
  | { kind: 'ready'; data: Dashboard };

export function CommandCenterView({ state }: { state: CommandCenterState }) {
  if (state.kind === 'loading') return <LoadingState />;
  if (state.kind === 'error')
    return <ErrorState correlationId={state.correlationId} retry={state.retry} />;

  const { data } = state;
  const activeTrip = data.trips.find((t) => t.id === data.activeTripId) ?? null;
  const isEmpty = data.trips.length === 0;

  return (
    <main className="page" aria-labelledby="cc-title">
      <div className="page__header">
        <div>
          <h1 className="page__title" id="cc-title">
            {strings.dashboard.welcome(data.organizerName)}
          </h1>
          {activeTrip ? (
            <p className="page__subtitle">
              {tripPhrase(activeTrip, data.now)}
              {' · '}
              {formatTime(data.now, activeTrip.timeZone)} {activeTrip.destination}
            </p>
          ) : null}
        </div>
        <div className="page__meta">
          {data.live ? (
            <span className="chip chip--active">{strings.dashboard.live}</span>
          ) : (
            <span className="chip chip--sample">{strings.dashboard.simulated}</span>
          )}
          <span>{strings.dashboard.lastSync(relativeTo(data.now, data.lastSyncAt))}</span>
        </div>
      </div>

      {data.offline ? (
        <div className="banner" role="status">
          <Icons.offline />
          {strings.states.offlineBanner(relativeTo(data.now, data.lastSyncAt))}
        </div>
      ) : null}

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <StatTiles data={data} />
          <div className="grid">
            <div className="stack">
              <AlertsPanel
                alerts={data.alerts}
                now={data.now}
                timeZone={activeTrip?.timeZone ?? 'UTC'}
              />
              <MovementsPanel movements={data.movements} now={data.now} />
            </div>
            <div className="stack">
              <HeadcountPanel groups={data.headcount} />
              <Announcements items={data.announcements} />
              <TripsPanel trips={data.trips} activeTripId={data.activeTripId} />
            </div>
          </div>
        </>
      )}
    </main>
  );
}

/** "Day 4" during the trip, "starts in 75 days" before it, "ended" after it. */
function tripPhrase(trip: Trip, now: string): string {
  const day = tripDayNumber(trip.startDate, now, trip.timeZone);
  if (day < 1) return strings.dashboard.subtitleBefore(1 - day, trip.name);
  const lastDay = tripDayNumber(trip.startDate, `${trip.endDate}T12:00:00Z`, trip.timeZone);
  if (day > lastDay) return strings.dashboard.subtitleAfter(trip.name);
  return strings.dashboard.subtitle(day, trip.name);
}

function LoadingState() {
  return (
    <main className="page" aria-busy="true" aria-label={strings.states.loading}>
      <div className="page__header">
        <div>
          <div className="skeleton" style={{ width: 320, height: 36 }} />
          <div className="skeleton" style={{ width: 240, height: 18, marginTop: 10 }} />
        </div>
      </div>
      <div className="stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 84 }} />
        ))}
      </div>
      <div className="grid">
        <div className="skeleton" style={{ height: 420 }} />
        <div className="skeleton" style={{ height: 420 }} />
      </div>
      <p className="sr-only">{strings.states.loading}</p>
    </main>
  );
}

function EmptyState() {
  return (
    <section className="card">
      <div className="state" role="status">
        <span className="state__icon">
          <Icons.plane />
        </span>
        <h2 className="state__title">{strings.states.emptyTitle}</h2>
        <p className="state__body">{strings.states.emptyBody}</p>
        <button type="button" className="btn btn--primary">
          <Icons.plus />
          {strings.states.emptyAction}
        </button>
      </div>
    </section>
  );
}

function ErrorState({ correlationId, retry }: { correlationId: string; retry: () => void }) {
  return (
    <main className="page">
      <section className="card">
        <div className="state" role="alert">
          <span className="state__icon">
            <Icons.alert />
          </span>
          <h2 className="state__title">{strings.states.errorTitle}</h2>
          <p className="state__body">{strings.states.errorBody(correlationId)}</p>
          <button type="button" className="btn btn--brand" onClick={retry}>
            {strings.states.retry}
          </button>
        </div>
      </section>
    </main>
  );
}
