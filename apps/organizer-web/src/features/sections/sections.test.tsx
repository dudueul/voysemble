// Copyright 2026- At Day. All rights reserved.
// Facts: every sample section renders its heading and the "Sample data" chip; counts derive from
// the fixtures; People filters narrow the table; chart scale helper rounds to clean maxima.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillingPage } from './BillingPage';
import { CommunicationPage } from './CommunicationPage';
import { niceMax } from './charts';
import { JourneyGraphPage } from './JourneyGraphPage';
import { MediaPage } from './MediaPage';
import { PeoplePage } from './PeoplePage';
import { PreparationPage } from './PreparationPage';
import { ReportsPage } from './ReportsPage';
import { SafetyPage } from './SafetyPage';
import { SettingsPage } from './SettingsPage';
import { TravelPage } from './TravelPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const text = (el: Element | null) => el?.textContent ?? '';

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
  timezone: 'Asia/Seoul',
  createdAt: '2026-10-11T00:00:00.000Z',
};
const ANN = {
  id: '33333333-3333-4333-8333-333333333333',
  tripId: TRIP.id,
  title: 'Breakfast moved to 06:30',
  body: 'Lobby. Bus leaves 07:15.',
  requiresAck: true,
  sharedWithGuardians: true,
  authorName: 'Organizer',
  publishedAt: '2026-12-30T20:30:00.000Z',
  ackTotal: 38,
  ackCount: 36,
  myAck: 'unacknowledged',
};

/** Fetch stub keyed by "METHOD path"; unknown paths answer 404 envelopes. */
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
      return Response.json(h(), { status: init?.method === 'POST' ? 201 : 200 });
    }),
  );
}

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const PAGES = [
  ['People', PeoplePage],
  ['Communication', CommunicationPage],
  ['Safety', SafetyPage],
  ['Journey Graph', JourneyGraphPage],
  ['Travel', TravelPage],
  ['Media', MediaPage],
  ['Preparation', PreparationPage],
  ['Reports', ReportsPage],
  ['Billing', BillingPage],
  ['Settings', SettingsPage],
] as const;

describe('sample sections', () => {
  for (const [title, Page] of PAGES) {
    it(`${title}: heading and Sample data chip`, () => {
      stubApi({});
      renderWithQuery(<Page />);
      expect(text(screen.getByRole('heading', { level: 1 }))).toBe(title);
      expect(screen.getAllByText('Sample data').length).toBeGreaterThan(0);
    });
  }

  it('People: filters narrow the table and guardians show their traveler', () => {
    render(<PeoplePage />);
    const table = screen.getByTestId('people-table');
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 19);
    fireEvent.click(screen.getByRole('button', { name: 'Guardians' }));
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 5);
    expect(text(table)).toContain('guardian of Minji Park');
    fireEvent.click(screen.getByRole('button', { name: 'Bus A' }));
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 2);
    expect(text(screen.getByTestId('people-joined'))).toBe('61');
  });

  it('Communication: real announcements with ack counts, unacked names on demand, publish', async () => {
    const posted: unknown[] = [];
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/announcements`]: () => ({ announcements: [ANN] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/announcements/${ANN.id}/acks`]: () => ({
        announcementId: ANN.id,
        acked: [],
        unacked: [
          { participationId: 'p1', displayName: 'Seojun Choi', groupName: 'Bus A', ackedAt: null },
          { participationId: 'p2', displayName: 'Jiwoo Han', groupName: 'Bus A', ackedAt: null },
        ],
      }),
      [`POST /v1/orgs/${ORG.id}/trips/${TRIP.id}/announcements`]: () => {
        posted.push(1);
        return { ...ANN, id: '44444444-4444-4444-8444-444444444444', title: 'New' };
      },
    });
    renderWithQuery(<CommunicationPage />);
    await waitFor(() => expect(text(screen.getByTestId(`ack-${ANN.id}`))).toBe('36/38'));
    expect(text(screen.getByRole('heading', { level: 1 }).parentElement)).toContain(
      '1 announcement still waiting',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Who has not?' }));
    await waitFor(() =>
      expect(text(screen.getByTestId(`unacked-${ANN.id}`))).toContain('Seojun Choi, Jiwoo Han'),
    );
    expect(within(screen.getByTestId('channel-list')).getAllByRole('listitem')).toHaveLength(5);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Body' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(posted).toHaveLength(1));
  });

  it('Communication: without a trip it points to setup', () => {
    stubApi({ 'GET /v1/orgs': () => ({ organizations: [] }) });
    renderWithQuery(<CommunicationPage />);
    return waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Create an organization and a trip first.',
      ),
    );
  });

  it('Safety: window state counts, missing list, fixture incidents without a trip', async () => {
    stubApi({ 'GET /v1/orgs': () => ({ organizations: [] }) });
    renderWithQuery(<SafetyPage />);
    expect(text(screen.getByTestId('win-inside'))).toBe('6');
    expect(text(screen.getByTestId('win-outside'))).toBe('1');
    expect(text(screen.getByTestId('win-opted_out'))).toBe('1');
    expect(within(screen.getByTestId('missing-list')).getAllByRole('listitem')).toHaveLength(2);
    await waitFor(() =>
      expect(within(screen.getByTestId('incident-list')).getAllByRole('listitem')).toHaveLength(2),
    );
    expect(
      screen.getByText('Create an organization and a trip first.', { exact: false }),
    ).toBeTruthy();
  });

  it('Safety: real incidents list open first and resolve with a note', async () => {
    const INC = {
      id: '55555555-5555-4555-8555-555555555555',
      tripId: TRIP.id,
      kind: 'headcount_missing',
      status: 'open',
      title: 'Head count closed with 1 missing (Bus A, 06:58)',
      headcountId: '66666666-6666-4666-8666-666666666666',
      people: [{ participationId: 'p2', displayName: 'Juho Kim', groupName: 'Bus A' }],
      openedAt: '2026-12-30T21:58:00.000Z',
      openedByName: 'Kim',
      resolvedAt: null,
      resolvedByName: null,
      resolutionNote: null,
    };
    const posted: unknown[] = [];
    let resolved = false;
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/incidents`]: () => ({
        incidents: resolved
          ? [
              {
                ...INC,
                status: 'resolved',
                resolvedByName: 'Organizer',
                resolvedAt: INC.openedAt,
                resolutionNote: 'Lobby',
              },
            ]
          : [INC],
      }),
      [`POST /v1/orgs/${ORG.id}/trips/${TRIP.id}/incidents/${INC.id}/resolve`]: () => {
        posted.push(1);
        resolved = true;
        return { ...INC, status: 'resolved', resolvedByName: 'Organizer' };
      },
    });
    renderWithQuery(<SafetyPage />);
    const card = await screen.findByTestId(`incident-${INC.id}`);
    expect(text(card)).toContain('Juho Kim');
    expect(text(card)).toContain('Open');
    expect(text(screen.getByRole('heading', { level: 1 }).parentElement)).toContain(
      '1 open incident',
    );
    fireEvent.change(within(card).getByLabelText('What happened (optional)'), {
      target: { value: 'Lobby' },
    });
    fireEvent.click(within(card).getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    await waitFor(() =>
      expect(text(screen.getByTestId(`incident-${INC.id}`))).toContain('Resolved by Organizer'),
    );
    expect(text(screen.getByTestId(`incident-${INC.id}`))).toContain('Lobby');
  });

  it('Journey graph: ten nodes today, tight connections flagged', () => {
    render(<JourneyGraphPage />);
    expect(screen.getAllByTestId(/^node-/)).toHaveLength(10);
    expect(text(screen.getByRole('heading', { level: 1 }).parentElement)).toContain(
      '3 tight connections',
    );
  });

  it('Reports: KPIs derive from day metrics and documents', () => {
    render(<ReportsPage />);
    expect(text(screen.getByTestId('kpi-Average ack rate'))).toBe('86%');
    expect(text(screen.getByTestId('kpi-Last head count closed in'))).toBe('6 min');
    expect(text(screen.getByTestId('kpi-Required documents'))).toBe('97%');
    expect(screen.getAllByText('Table view')).toHaveLength(2);
  });

  it('Billing: ledger totals and per-row status chips', () => {
    render(<BillingPage />);
    expect(text(screen.getByTestId('ledger-collected'))).toBe(
      '₩82,800,000 of ₩88,800,000 collected',
    );
    expect(within(screen.getByTestId('ledger-table')).getAllByRole('row')).toHaveLength(1 + 6);
    expect(screen.getByText('Unpaid')).toBeTruthy();
  });

  it('Media: flagged photos sit in the queue, not the pool', () => {
    render(<MediaPage />);
    expect(within(screen.getByTestId('media-queue')).getAllByRole('listitem')).toHaveLength(3);
    expect(within(screen.getByTestId('media-pool')).getAllByRole('figure')).toHaveLength(15);
  });

  it('Preparation: per-document counts', () => {
    render(<PreparationPage />);
    expect(text(screen.getByTestId('doc-d2'))).toBe('36/38');
    expect(text(screen.getByRole('heading', { level: 1 }).parentElement)).toContain(
      '5 required documents still missing',
    );
  });
});

describe('niceMax', () => {
  it('rounds to clean axis maxima', () => {
    expect(niceMax([0])).toBe(10);
    expect(niceMax([14])).toBe(15);
    expect(niceMax([71, 95])).toBe(100);
    expect(niceMax([6, 9])).toBe(10);
    expect(niceMax([120])).toBe(150);
  });
});
