// Copyright 2026- At Day. All rights reserved.
// Facts (D29, slice 052): the sample log shows three events; the live log reads the trip's events
// with their lane counts and the held chip; an empty live log says so.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationsPage } from './NotificationsPage';

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
      <NotificationsPage />
    </QueryClientProvider>,
  );
}

describe('the notification log', () => {
  it('shows the sample without a trip', () => {
    stubApi({});
    renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Notifications');
    expect(screen.getByTestId('notif-log').querySelectorAll('tbody tr')).toHaveLength(3);
    expect(screen.getByText('Sample data')).toBeTruthy();
  });

  it('reads the live log with its lanes and the held chip', async () => {
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/notifications`]: () => ({
        events: [
          {
            createdAt: '2026-12-31T05:31:00.000Z',
            kind: 'announcement',
            title: 'Breakfast moved to 06:30',
            refType: 'announcement',
            refId: 'a1',
            lanes: { priority: 3, normal: 3, digest: 0 },
            held: 0,
            recipients: 6,
          },
          {
            createdAt: '2026-12-30T22:10:00.000Z',
            kind: 'itinerary_revision',
            title: 'Itinerary updated',
            refType: 'announcement',
            refId: 'a2',
            lanes: { priority: 0, normal: 4, digest: 2 },
            held: 4,
            recipients: 6,
          },
        ],
      }),
    });
    renderPage();
    await screen.findByText('Live');
    const first = await screen.findByTestId('notif-a1');
    expect(first.textContent).toContain('Breakfast moved to 06:30');
    expect(first.textContent).toContain('announcement');
    expect(first.querySelectorAll('td')[2]?.textContent).toBe('3');
    expect(first.querySelectorAll('td')[0]?.textContent).toBe('2026-12-31 06:31');
    const second = screen.getByTestId('notif-a2');
    expect(second.textContent).toContain('4 until quiet hours end');
    expect(screen.getByRole('heading', { level: 1 }).parentElement?.textContent).toContain(
      '2 events sent',
    );
  });

  it('says so when nothing went out yet', async () => {
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/notifications`]: () => ({ events: [] }),
    });
    renderPage();
    expect((await screen.findByTestId('notif-empty')).textContent).toContain('Nothing sent yet');
  });
});
