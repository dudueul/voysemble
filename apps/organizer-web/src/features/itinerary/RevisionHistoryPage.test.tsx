// Copyright 2026- At Day. All rights reserved.
// Facts (D19, slice 057): the sample shows two revisions; the live page lists the trip's
// revisions newest first with their counts and change lines, and the fold loads a snapshot; an
// empty history says so.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevisionHistoryPage } from './RevisionHistoryPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ORG = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Seoul Arts High',
  defaultLocale: 'ko',
  createdAt: '2026-10-11T00:00:00.000Z',
  role: 'owner',
};
const TRIP = {
  id: '22222222-2222-4222-8222-222222222222',
  organizationId: ORG.id,
  name: 'Tour',
  startsOn: '2026-12-26',
  endsOn: '2027-01-07',
  timezone: 'Europe/Rome',
  createdAt: '2026-10-11T00:00:00.000Z',
};
const base = `/v1/orgs/${ORG.id}/trips/${TRIP.id}`;

function stubApi(routes: Record<string, () => unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(input)}`;
      const h = routes[key];
      if (!h)
        return Response.json(
          { error: { code: 'NOT_FOUND', message: key, correlationId: 't' } },
          { status: 404 },
        );
      return Response.json(h());
    }),
  );
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RevisionHistoryPage />
    </QueryClientProvider>,
  );
}

const event = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  tripId: TRIP.id,
  date: '2026-12-26',
  start: '09:00',
  end: null,
  timeZone: 'Europe/Rome',
  kind: 'meeting',
  title: 'Group check-in',
  place: 'ICN Terminal 2',
  pax: null,
  status: 'scheduled',
  note: null,
  order: 1,
  published: true,
};

describe('the revision history', () => {
  it('shows the sample without a trip', () => {
    stubApi({});
    renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Revision history');
    expect(
      screen.getByTestId('history-list').querySelectorAll('section, .card').length,
    ).toBeGreaterThan(0);
    expect(screen.getByTestId('revision-2-changes').textContent).toContain(
      'Day 4 · Breakfast · 07:00 → 07:30',
    );
    expect(screen.getByText('Sample data')).toBeTruthy();
  });

  it('lists the live revisions and loads a snapshot on demand', async () => {
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET ${base}/itinerary/revisions`]: () => ({
        revisions: [
          {
            revision: 2,
            publishedAt: '2026-12-20T10:00:00.000Z',
            publishedByName: 'Nate',
            events: 1,
            summary: {
              revision: 2,
              fromRevision: 1,
              added: 0,
              changed: 1,
              removed: 0,
              changes: [
                {
                  kind: 'changed',
                  eventId: event.id,
                  date: '2026-12-26',
                  day: 1,
                  title: 'Group check-in',
                  start: '08:30',
                  fields: ['start'],
                  previousStart: '09:00',
                },
              ],
            },
          },
          {
            revision: 1,
            publishedAt: '2026-12-19T10:00:00.000Z',
            publishedByName: 'Nate',
            events: 1,
            summary: {
              revision: 1,
              fromRevision: 0,
              added: 1,
              changed: 0,
              removed: 0,
              changes: [],
            },
          },
        ],
      }),
      [`GET ${base}/itinerary/revisions/1`]: () => ({
        revision: 1,
        publishedAt: '2026-12-19T10:00:00.000Z',
        publishedByName: 'Nate',
        events: 1,
        summary: { revision: 1, fromRevision: 0, added: 1, changed: 0, removed: 0, changes: [] },
        snapshot: [event],
      }),
    });
    renderPage();
    await screen.findByText('Live');
    expect((await screen.findByTestId('revision-2-counts')).textContent).toContain(
      '0 added · 1 changed · 0 removed',
    );
    expect(screen.getByTestId('revision-2-changes').textContent).toContain(
      'Day 1 · Group check-in · 09:00 → 08:30',
    );
    expect(screen.getByText('The first publish: every event is new.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).parentElement?.textContent).toContain(
      '2 revisions kept',
    );
    // The card titles carry the trip-zone clock.
    expect(screen.getByText('Revision 2 · 2026-12-20 11:00 · Nate')).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Show the events as published' })[1] as HTMLElement,
    );
    expect((await screen.findByTestId('revision-1-snapshot')).textContent).toContain(
      '2026-12-26 09:00 · Group check-in · ICN Terminal 2',
    );
  });

  it('says so when nothing was published', async () => {
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET ${base}/itinerary/revisions`]: () => ({ revisions: [] }),
    });
    renderPage();
    expect((await screen.findByTestId('history-empty')).textContent).toContain('No revision yet');
  });
});
