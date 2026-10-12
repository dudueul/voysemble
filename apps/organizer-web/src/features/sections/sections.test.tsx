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
import { ReportsPage, reportCsv } from './ReportsPage';
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
  translation: {
    locale: 'ko',
    body: '로비. 버스는 07:15에 출발합니다.',
    provider: 'machine',
    editedBy: null,
  },
  kind: 'announcement',
  revision: null,
};

const REV = {
  ...ANN,
  id: '88888888-8888-4888-8888-888888888888',
  title: 'Itinerary updated',
  body: 'The itinerary was updated: 1 change.\nDay 4: Colosseum now 08:30 (was 09:00).',
  authorName: 'Organizer',
  translation: null,
  kind: 'itinerary_revision',
  revision: {
    revision: 2,
    fromRevision: 1,
    added: 0,
    changed: 1,
    removed: 0,
    changes: [
      {
        kind: 'changed',
        eventId: 'e',
        date: '2026-12-31',
        day: 4,
        title: 'Colosseum',
        start: '08:30',
        fields: ['start'],
        previousStart: '09:00',
      },
    ],
  },
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
    stubApi({});
    renderWithQuery(<PeoplePage />);
    const table = screen.getByTestId('people-table');
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 19);
    fireEvent.click(screen.getByRole('button', { name: 'Guardians' }));
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 5);
    expect(text(table)).toContain('guardian of Minji Park');
    fireEvent.click(screen.getByRole('button', { name: 'Bus A' }));
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 2);
    expect(text(screen.getByTestId('people-joined'))).toBe('61');
  });

  it('People: live roster from the API with invite status, guardian binding, group chips', async () => {
    const base = `/v1/orgs/${ORG.id}/trips/${TRIP.id}`;
    const row = (p: Record<string, unknown>) => ({
      tripId: TRIP.id,
      groupName: null,
      guardianOf: null,
      accountId: null,
      createdAt: '2026-10-11T00:00:00.000Z',
      invite: 'none',
      lastAckAt: null,
      ...p,
    });
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET ${base}/roster`]: () => ({
        participations: [
          row({
            id: 'p1',
            role: 'traveler',
            displayName: 'Minji Park',
            groupName: 'Bus A',
            invite: 'joined',
            accountId: 'a1',
            lastAckAt: new Date(Date.now() - 5 * 60_000).toISOString(),
          }),
          row({
            id: 'p2',
            role: 'guardian',
            displayName: 'Sora Park',
            groupName: 'Bus A',
            guardianOf: 'p1',
            invite: 'issued',
          }),
          row({
            id: 'p3',
            role: 'traveler',
            displayName: 'Juho Kim',
            groupName: 'Bus B',
            invite: 'expired',
          }),
        ],
      }),
    });
    renderWithQuery(<PeoplePage />);
    await waitFor(() => expect(screen.getByTestId('person-p1')).toBeTruthy());
    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.queryByText('Sample data')).toBeNull();
    expect(text(screen.getByTestId('people-joined'))).toBe('1');
    expect(text(screen.getByTestId('people-groups'))).toBe('2');
    expect(text(screen.getByTestId('people-not-joined'))).toBe('2');
    const table = screen.getByTestId('people-table');
    expect(text(screen.getByTestId('person-p1'))).toContain('Joined');
    expect(text(screen.getByTestId('person-p1'))).toContain('5 min ago');
    expect(text(screen.getByTestId('person-p2'))).toContain('Invited');
    expect(text(screen.getByTestId('person-p2'))).toContain('guardian of Minji Park');
    expect(text(screen.getByTestId('person-p3'))).toContain('Code expired');
    expect(within(table).queryByRole('button', { name: /Reveal care note/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bus B' }));
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 1);
    expect(screen.getByText(/Showing 1 of 3 people\./)).toBeTruthy();
  });

  it('People: selecting a person opens the card with links and the timeline; Close hides it', async () => {
    const base = `/v1/orgs/${ORG.id}/trips/${TRIP.id}`;
    const row = (p: Record<string, unknown>) => ({
      tripId: TRIP.id,
      groupName: 'Bus A',
      guardianOf: null,
      accountId: null,
      createdAt: '2026-10-11T00:00:00.000Z',
      invite: 'joined',
      lastAckAt: null,
      ...p,
    });
    const minji = row({ id: 'p1', role: 'traveler', displayName: 'Minji Park', accountId: 'a1' });
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET ${base}/roster`]: () => ({
        participations: [
          minji,
          row({
            id: 'p2',
            role: 'guardian',
            displayName: 'Sora Park',
            guardianOf: 'p1',
            invite: 'issued',
          }),
        ],
      }),
      [`GET ${base}/people/p1/care-note`]: () => ({
        participationId: 'p1',
        hasCareNote: false,
        updatedAt: null,
        updatedByName: null,
        reveals: 0,
      }),
      [`GET ${base}/people/p1/timeline`]: () => ({
        participation: minji,
        guardianOf: null,
        guardians: [{ participationId: 'p2', displayName: 'Sora Park', invite: 'issued' }],
        entries: [
          {
            kind: 'headcount',
            at: new Date(Date.now() - 10 * 60_000).toISOString(),
            title: 'Head count · Bus A · present',
            detail: 'Opened 06:50 by Kim · closed 06:55',
            ref: { type: 'headcount', id: 'h1' },
          },
          {
            kind: 'joined',
            at: new Date(Date.now() - 60 * 60_000).toISOString(),
            title: 'Joined with the invite code',
            detail: null,
            ref: null,
          },
        ],
      }),
    });
    renderWithQuery(<PeoplePage />);
    await waitFor(() => expect(screen.getByTestId('person-p1')).toBeTruthy());
    expect(screen.getByText(/Select a person to see their card/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open the card of Minji Park' }));
    await waitFor(() => expect(screen.getByTestId('person-card')).toBeTruthy());
    const card = screen.getByTestId('person-card');
    expect(text(card)).toContain('Minji Park');
    expect(text(card)).toContain('Guardians: Sora Park · Invited');
    await waitFor(() =>
      expect(text(screen.getByTestId('care-status'))).toBe('No care note on file.'),
    );
    const items = within(screen.getByTestId('timeline')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(text(items[0] ?? null)).toContain('Head count · Bus A · present');
    expect(text(items[0] ?? null)).toContain('10 min ago');
    expect(screen.getByTestId('person-p1').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('person-card')).toBeNull();
  });

  it('People: care note on the card: save, audited reveal, roster reveal, clear', async () => {
    const base = `/v1/orgs/${ORG.id}/trips/${TRIP.id}`;
    const minji = {
      id: 'p1',
      tripId: TRIP.id,
      role: 'traveler',
      displayName: 'Minji Park',
      groupName: 'Bus A',
      guardianOf: null,
      accountId: 'a1',
      createdAt: '2026-10-11T00:00:00.000Z',
      invite: 'joined',
      lastAckAt: null,
      hasCareNote: false,
    };
    let stored: { allergies: string; medications: string; freeText: string } | null = null;
    let reveals = 0;
    const puts: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${init?.method ?? 'GET'} ${String(input)}`;
        if (key === 'GET /v1/orgs') return Response.json({ organizations: [ORG] });
        if (key === `GET /v1/orgs/${ORG.id}/trips`) return Response.json({ trips: [TRIP] });
        if (key === `GET ${base}/roster`)
          return Response.json({ participations: [{ ...minji, hasCareNote: stored !== null }] });
        if (key === `GET ${base}/people/p1/timeline`)
          return Response.json({
            participation: { ...minji, hasCareNote: stored !== null },
            guardianOf: null,
            guardians: [],
            entries: [],
          });
        if (key === `GET ${base}/people/p1/care-note`)
          return Response.json({
            participationId: 'p1',
            hasCareNote: stored !== null,
            updatedAt: stored ? '2026-10-12T04:00:00.000Z' : null,
            updatedByName: stored ? 'Owner' : null,
            reveals,
          });
        if (key === `PUT ${base}/people/p1/care-note`) {
          const body = JSON.parse(String(init?.body)) as typeof minji & {
            allergies: string;
            medications: string;
            freeText: string;
          };
          puts.push(body);
          stored = body.allergies || body.medications || body.freeText ? body : null;
          return Response.json({
            participationId: 'p1',
            hasCareNote: stored !== null,
            updatedAt: '2026-10-12T04:00:00.000Z',
            updatedByName: 'Owner',
            reveals,
          });
        }
        if (key === `POST ${base}/people/p1/care-note/reveal`) {
          reveals += 1;
          if (!stored)
            return Response.json(
              {
                error: { code: 'NOT_FOUND', message: 'No care note on file.', correlationId: 't' },
              },
              { status: 404 },
            );
          return Response.json({
            participationId: 'p1',
            note: stored,
            updatedAt: '2026-10-12T04:00:00.000Z',
            updatedByName: 'Owner',
            revealedAt: '2026-10-12T04:05:00.000Z',
          });
        }
        return Response.json(
          { error: { code: 'NOT_FOUND', message: key, correlationId: 't' } },
          { status: 404 },
        );
      }),
    );
    renderWithQuery(<PeoplePage />);
    await waitFor(() => expect(screen.getByTestId('person-p1')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Open the card of Minji Park' }));
    await waitFor(() =>
      expect(text(screen.getByTestId('care-status'))).toBe('No care note on file.'),
    );
    expect(screen.queryByRole('button', { name: 'Reveal (audited)' })).toBeNull();

    // Save from the card.
    fireEvent.click(screen.getByRole('button', { name: 'Edit care note' }));
    const form = screen.getByRole('form', { name: 'Edit care note' });
    fireEvent.change(within(form).getByLabelText('Allergies'), { target: { value: 'Peanuts' } });
    fireEvent.change(within(form).getByLabelText('Medications'), {
      target: { value: 'EpiPen in the red bag' },
    });
    fireEvent.submit(form);
    await waitFor(() =>
      expect(text(screen.getByTestId('care-note-status'))).toBe('Care note saved.'),
    );
    expect(puts[0]).toEqual({
      allergies: 'Peanuts',
      medications: 'EpiPen in the red bag',
      freeText: '',
    });
    await waitFor(() => expect(text(screen.getByTestId('care-status'))).toContain('Set by Owner'));
    // The content shown after the save came from what was typed, not from a reveal: no audit yet.
    expect(text(screen.getByTestId('care-content'))).toContain('EpiPen in the red bag');
    expect(reveals).toBe(0);

    // Hide, then reveal (audited) on the card; the roster column reveals too.
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByTestId('care-content')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal (audited)' }));
    await waitFor(() => expect(screen.getByTestId('care-content')).toBeTruthy());
    expect(reveals).toBe(1);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Reveal care note for Minji Park (audited)' }),
      ).toBeTruthy(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Reveal care note for Minji Park (audited)' }),
    );
    await waitFor(() =>
      expect(text(screen.getByTestId('care-line-p1'))).toBe(
        'Allergies: Peanuts · Medications: EpiPen in the red bag',
      ),
    );
    expect(reveals).toBe(2);

    // Clear from the edit form.
    fireEvent.click(screen.getByRole('button', { name: 'Edit care note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear care note' }));
    await waitFor(() =>
      expect(text(screen.getByTestId('care-note-status'))).toBe('Care note cleared.'),
    );
    expect(puts[1]).toEqual({ allergies: '', medications: '', freeText: '' });
    await waitFor(() =>
      expect(text(screen.getByTestId('care-status'))).toBe('No care note on file.'),
    );
  });

  it('People: revoking devices on a joined card confirms, posts, and shows the new code', async () => {
    const base = `/v1/orgs/${ORG.id}/trips/${TRIP.id}`;
    const minji = {
      id: 'p1',
      tripId: TRIP.id,
      role: 'traveler',
      displayName: 'Minji Park',
      groupName: 'Bus A',
      guardianOf: null,
      accountId: 'a1',
      createdAt: '2026-10-11T00:00:00.000Z',
      invite: 'joined',
      lastAckAt: null,
      hasCareNote: false,
    };
    let revoked = false;
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET ${base}/roster`]: () => ({
        participations: [revoked ? { ...minji, accountId: null, invite: 'issued' } : minji],
      }),
      [`GET ${base}/people/p1/care-note`]: () => ({
        participationId: 'p1',
        hasCareNote: false,
        updatedAt: null,
        updatedByName: null,
        reveals: 0,
      }),
      [`GET ${base}/people/p1/timeline`]: () => ({
        participation: revoked ? { ...minji, accountId: null, invite: 'issued' } : minji,
        guardianOf: null,
        guardians: [],
        entries: revoked
          ? [
              {
                kind: 'devices_revoked',
                at: new Date().toISOString(),
                title: 'Devices revoked by Owner',
                detail: 'Every phone signed out; a new invite code was issued.',
                ref: null,
              },
            ]
          : [],
      }),
      [`POST ${base}/roster/p1/revoke-devices`]: () => {
        revoked = true;
        return {
          revokedSessions: 1,
          invite: {
            participationId: 'p1',
            role: 'traveler',
            displayName: 'Minji Park',
            code: 'K7PX-4MDQ',
            expiresAt: '2026-11-11T00:00:00.000Z',
          },
        };
      },
    });
    renderWithQuery(<PeoplePage />);
    await waitFor(() => expect(screen.getByTestId('person-p1')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Open the card of Minji Park' }));
    await waitFor(() => expect(screen.getByTestId('person-card')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Remove from roster' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke devices' }));
    expect(text(screen.getByTestId('revoke-devices-confirm'))).toContain(
      'Sign out every phone of Minji Park and issue a new invite code?',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, revoke devices' }));
    await waitFor(() =>
      expect(text(screen.getByTestId('roster-action-status'))).toBe(
        '1 phone signed out. New code K7PX-4MDQ (valid until 2026-11-11); hand it over in person.',
      ),
    );
    await waitFor(() => expect(text(screen.getByTestId('person-p1'))).toContain('Invited'));
    await waitFor(() =>
      expect(text(screen.getByTestId('timeline'))).toContain('Devices revoked by Owner'),
    );
    expect(screen.getByRole('button', { name: 'Remove from roster' })).toBeTruthy();
  });

  it('People: roster actions on the card edit, revoke and remove with the right calls', async () => {
    const base = `/v1/orgs/${ORG.id}/trips/${TRIP.id}`;
    const calls: { method: string; url: string; body?: unknown }[] = [];
    const juho = {
      id: 'p3',
      tripId: TRIP.id,
      role: 'traveler',
      displayName: 'Juho Kim',
      groupName: 'Bus A',
      guardianOf: null,
      accountId: null,
      createdAt: '2026-10-11T00:00:00.000Z',
      invite: 'issued',
      lastAckAt: null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (method !== 'GET')
          calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (method === 'GET' && url === '/v1/orgs') return Response.json({ organizations: [ORG] });
        if (method === 'GET' && url === `/v1/orgs/${ORG.id}/trips`)
          return Response.json({ trips: [TRIP] });
        if (method === 'GET' && url === `${base}/roster`)
          return Response.json({ participations: [juho] });
        if (method === 'GET' && url === `${base}/people/p3/timeline`)
          return Response.json({
            participation: juho,
            guardianOf: null,
            guardians: [],
            entries: [],
          });
        if (method === 'PATCH' && url === `${base}/roster/p3`)
          return Response.json({ ...juho, groupName: 'Bus B' });
        if (method === 'POST' && url === `${base}/roster/p3/revoke-invite`)
          return Response.json({ revoked: 1 });
        if (method === 'DELETE' && url === `${base}/roster/p3`)
          return Response.json({ removed: ['p3'] });
        return Response.json(
          { error: { code: 'NOT_FOUND', message: url, correlationId: 't' } },
          { status: 404 },
        );
      }),
    );
    renderWithQuery(<PeoplePage />);
    await waitFor(() => expect(screen.getByTestId('person-p3')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Open the card of Juho Kim' }));
    await waitFor(() => expect(screen.getByTestId('roster-actions')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Group (empty for none)'), {
      target: { value: 'Bus B' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(text(screen.getByTestId('roster-action-status'))).toBe('Saved.'));
    expect(calls[0]).toEqual({
      method: 'PATCH',
      url: `${base}/roster/p3`,
      body: { displayName: 'Juho Kim', groupName: 'Bus B' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke code' }));
    await waitFor(() =>
      expect(text(screen.getByTestId('roster-action-status'))).toContain('Code revoked.'),
    );
    expect(calls[1]).toMatchObject({ method: 'POST', url: `${base}/roster/p3/revoke-invite` });
    fireEvent.click(screen.getByRole('button', { name: 'Remove from roster' }));
    expect(screen.getByText('Remove Juho Kim? Their code stops working.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(screen.queryByTestId('person-card')).toBeNull());
    expect(calls[2]).toMatchObject({ method: 'DELETE', url: `${base}/roster/p3` });
  });

  it('Billing: live ledger with totals, set fee, save a payment, import CSV', async () => {
    const base = `/v1/orgs/${ORG.id}/trips/${TRIP.id}`;
    const posted: { url: string; body: unknown }[] = [];
    let rows = [
      {
        participationId: 'p1',
        displayName: 'Minji Park',
        groupName: 'Bus A',
        currency: 'KRW',
        amountDueMinor: 450000,
        paidMinor: 0,
        refundedMinor: 0,
        dueOn: '2026-11-30',
        note: null,
        status: 'unpaid',
        updatedAt: '2026-10-12T00:00:00.000Z',
        updatedByName: 'Owner',
      },
    ];
    const ledger = () => ({
      currency: 'KRW',
      rows,
      withoutFee: 0,
      totals: {
        expectedMinor: 450000,
        collectedMinor: rows[0]?.paidMinor ?? 0,
        refundedMinor: 0,
        paid: rows[0]?.status === 'paid' ? 1 : 0,
        partial: 0,
        unpaid: rows[0]?.status === 'unpaid' ? 1 : 0,
        refunded: 0,
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (method === 'GET' && url === '/v1/orgs') return Response.json({ organizations: [ORG] });
        if (method === 'GET' && url === `/v1/orgs/${ORG.id}/trips`)
          return Response.json({ trips: [TRIP] });
        if (method === 'GET' && url === `${base}/fees`) return Response.json(ledger());
        if (method === 'PATCH' && url === `${base}/fees/p1`) {
          posted.push({ url, body: JSON.parse(String(init?.body)) });
          rows = [{ ...(rows[0] as (typeof rows)[number]), paidMinor: 450000, status: 'paid' }];
          return Response.json(rows[0]);
        }
        if (method === 'POST' && url === `${base}/fees/import`) {
          posted.push({ url, body: JSON.parse(String(init?.body)) });
          return Response.json({
            applied: 1,
            unmatched: ['Nobody'],
            skipped: [],
            ledger: ledger(),
          });
        }
        return Response.json(
          { error: { code: 'NOT_FOUND', message: url, correlationId: 't' } },
          { status: 404 },
        );
      }),
    );
    renderWithQuery(<BillingPage />);
    await waitFor(() => expect(screen.getByTestId('fee-p1')).toBeTruthy());
    expect(screen.getByText('Live')).toBeTruthy();
    expect(text(screen.getByTestId('ledger-collected'))).toBe('₩0 of ₩450,000 collected');
    expect(text(screen.getByTestId('ledger-counts'))).toBe(
      '0 paid · 0 partial · 1 unpaid · 0 refunded',
    );
    expect(text(screen.getByTestId('fee-p1'))).toContain('Unpaid');
    fireEvent.change(screen.getByLabelText('Paid by Minji Park'), { target: { value: '450,000' } });
    fireEvent.click(screen.getByLabelText('Save payment for Minji Park'));
    await waitFor(() => expect(text(screen.getByTestId('fee-p1'))).toContain('Paid'));
    expect(posted[0]).toEqual({ url: `${base}/fees/p1`, body: { paidMinor: 450000 } });
    await waitFor(() =>
      expect(text(screen.getByTestId('ledger-collected'))).toBe('₩450,000 of ₩450,000 collected'),
    );
    fireEvent.change(screen.getByLabelText('Bank CSV'), {
      target: { value: 'name,paid\nNobody,1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import rows' }));
    await waitFor(() =>
      expect(text(screen.getByTestId('fee-import-status'))).toBe(
        '1 row applied · unmatched: Nobody',
      ),
    );
  });

  it('Communication: real announcements with ack counts, unacked names on demand, publish', async () => {
    const posted: unknown[] = [];
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/announcements`]: () => ({
        announcements: [ANN, REV],
      }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/chats`]: () => ({
        channels: [
          {
            id: 'trip',
            kind: 'trip',
            title: 'Everyone on the trip',
            subtitle: '3 travelers · 1 leaders · the organizer',
            unread: 0,
            lastMessage: null,
          },
          {
            id: 'guardian:p2',
            kind: 'guardian',
            title: 'Sora Park',
            subtitle: 'guardian of Minji Park',
            unread: 1,
            lastMessage: null,
          },
        ],
      }),
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
    expect(text(screen.getByTestId(`revision-chip-${REV.id}`))).toBe(
      'Itinerary update · revision 2',
    );
    expect(text(screen.getByTestId(`changes-${REV.id}`))).toContain(
      'Day 4 · Colosseum · 09:00 → 08:30',
    );
    const tr = screen.getByTestId(`translation-${ANN.id}`);
    expect(text(tr)).toContain('Machine translation · 한국어');
    expect(text(tr)).toContain('로비. 버스는 07:15에 출발합니다.');
    expect(text(screen.getByRole('heading', { level: 1 }).parentElement)).toContain(
      '2 announcements still waiting',
    );
    fireEvent.click(
      within(screen.getByTestId(`announcement-${ANN.id}`)).getByRole('button', {
        name: 'Who has not?',
      }),
    );
    await waitFor(() =>
      expect(text(screen.getByTestId(`unacked-${ANN.id}`))).toContain('Seojun Choi, Jiwoo Han'),
    );
    await waitFor(() =>
      expect(within(screen.getByTestId('channel-list')).getAllByRole('listitem')).toHaveLength(2),
    );
    expect(text(screen.getByTestId('unread-guardian:p2'))).toBe('1');

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Body' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(posted).toHaveLength(1));
  });

  it('Communication: a guardian thread opens, shows messages, and sends a reply', async () => {
    const base = `/v1/orgs/${ORG.id}/trips/${TRIP.id}`;
    const posted: unknown[] = [];
    const first = {
      id: '11111111-aaaa-4aaa-8aaa-111111111111',
      channelId: 'guardian:p2',
      senderName: 'Sora Park',
      senderRole: 'guardian',
      body: 'Will the bus be late?',
      sentAt: new Date(Date.now() - 3 * 60_000).toISOString(),
      mine: false,
    };
    const messages = [first];
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET ${base}/announcements`]: () => ({ announcements: [] }),
      [`GET ${base}/chats`]: () => ({
        channels: [
          {
            id: 'guardian:p2',
            kind: 'guardian',
            title: 'Sora Park',
            subtitle: 'guardian of Minji Park',
            unread: 1,
            lastMessage: messages[0],
          },
        ],
      }),
      [`GET ${base}/chats/${encodeURIComponent('guardian:p2')}/messages`]: () => ({
        channel: {
          id: 'guardian:p2',
          kind: 'guardian',
          title: 'Sora Park',
          subtitle: 'guardian of Minji Park',
          unread: 0,
          lastMessage: null,
        },
        messages,
      }),
      [`POST ${base}/chats/${encodeURIComponent('guardian:p2')}/messages`]: () => {
        posted.push(1);
        const m = {
          ...first,
          id: '22222222-aaaa-4aaa-8aaa-222222222222',
          senderName: 'Owner',
          senderRole: 'owner',
          body: 'Ten minutes.',
          mine: true,
        };
        messages.push(m);
        return m;
      },
    });
    renderWithQuery(<CommunicationPage />);
    const open = await screen.findByRole('button', { name: 'Open Sora Park' });
    fireEvent.click(open);
    await waitFor(() =>
      expect(text(screen.getByTestId('chat-messages'))).toContain('Will the bus be late?'),
    );
    const thread = screen.getByTestId('chat-thread');
    fireEvent.change(within(thread).getByLabelText('Message'), {
      target: { value: 'Ten minutes.' },
    });
    fireEvent.submit(within(thread).getByRole('form', { name: 'Send' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    await waitFor(() =>
      expect(text(screen.getByTestId('chat-messages'))).toContain('Ten minutes.'),
    );
    fireEvent.click(screen.getByRole('button', { name: /All channels/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open Sora Park' })).toBeTruthy(),
    );
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

  it('Safety: live meeting window with member states, then closed from the console', async () => {
    const WIN = {
      id: '88888888-8888-4888-8888-888888888888',
      tripId: TRIP.id,
      label: 'Colosseum regroup',
      place: 'Colosseum, main entrance',
      radiusMeters: 200,
      startsAt: '2026-12-31T09:45:00.000Z',
      endsAt: '2026-12-31T10:20:00.000Z',
      groups: ['Bus A'],
      openedByName: 'Kim',
      openedAt: '2026-12-31T09:40:00.000Z',
      closedAt: null,
      status: 'open',
      center: { lat: 41.8902, lng: 12.4922 },
      members: [
        {
          participationId: 'p1',
          displayName: 'Minji Park',
          groupName: 'Bus A',
          state: 'inside',
          reportedAt: '2026-12-31T09:50:00.000Z',
        },
        {
          participationId: 'p2',
          displayName: 'Juho Kim',
          groupName: 'Bus A',
          state: 'outside',
          reportedAt: '2026-12-31T09:51:00.000Z',
        },
        {
          participationId: 'p3',
          displayName: 'Hana Lee',
          groupName: 'Bus A',
          state: 'opted_out',
          reportedAt: null,
        },
      ],
      counts: { inside: 1, outside: 1, uncertain: 0, stale: 0, optedOut: 1, total: 3 },
    };
    let closed = false;
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/incidents`]: () => ({ incidents: [] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/headcounts`]: () => ({ headcounts: [] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/windows`]: () => ({
        windows: closed
          ? [{ ...WIN, status: 'closed', closedAt: WIN.endsAt, center: null }]
          : [WIN],
      }),
      [`POST /v1/orgs/${ORG.id}/trips/${TRIP.id}/windows/${WIN.id}/close`]: () => {
        closed = true;
        return { ...WIN, status: 'closed', closedAt: WIN.endsAt, center: null };
      },
    });
    renderWithQuery(<SafetyPage />);
    // The fixture card carries the same label while the org loads; wait for the live chip.
    await screen.findByTestId('window-status');
    expect(text(screen.getByText('Meeting window: Colosseum regroup'))).toBeTruthy();
    expect(text(screen.getByTestId('window-status'))).toBe('Open');
    expect(screen.getAllByText('Live').length).toBeGreaterThan(0);
    expect(text(screen.getByTestId('win-inside'))).toBe('1');
    expect(text(screen.getByTestId('win-outside'))).toBe('1');
    expect(text(screen.getByTestId('win-opted_out'))).toBe('1');
    const members = within(screen.getByTestId('window-members')).getAllByRole('listitem');
    expect(members).toHaveLength(3);
    expect(text(members[0] ?? null)).toContain('Minji Park');
    expect(text(members[0] ?? null)).toContain('Inside');
    expect(text(members[2] ?? null)).toContain('not reported yet');
    // Two spots drawn (the opted-out member is not), each titled with the name and state.
    const pins = Array.from(document.querySelectorAll('.map__pin title')).map((t) => t.textContent);
    expect(pins).toEqual(['Minji Park: Inside', 'Juho Kim: Outside']);
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }));
    await screen.findByTestId('no-window');
    expect(text(screen.getByTestId('earlier-windows'))).toContain('Colosseum regroup');
    expect(text(screen.getByTestId('earlier-windows'))).toContain('Closed');
  });

  it('Safety: opening a window from the console posts the meeting point once', async () => {
    const posted: unknown[] = [];
    let opened = false;
    const WIN = {
      id: '99999999-9999-4999-8999-999999999999',
      tripId: TRIP.id,
      label: 'Hotel lobby',
      place: 'Hotel Roma lobby',
      radiusMeters: 50,
      startsAt: '2026-12-31T09:45:00.000Z',
      endsAt: '2026-12-31T10:20:00.000Z',
      groups: [],
      openedByName: 'Organizer',
      openedAt: '2026-12-31T09:40:00.000Z',
      closedAt: null,
      status: 'open',
      center: { lat: 41.9, lng: 12.5 },
      members: [],
      counts: { inside: 0, outside: 0, uncertain: 0, stale: 0, optedOut: 0, total: 0 },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${init?.method ?? 'GET'} ${String(input)}`;
        if (key === 'GET /v1/orgs') return Response.json({ organizations: [ORG] });
        if (key === `GET /v1/orgs/${ORG.id}/trips`) return Response.json({ trips: [TRIP] });
        if (key === `GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/incidents`)
          return Response.json({ incidents: [] });
        if (key === `GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/headcounts`)
          return Response.json({ headcounts: [] });
        if (key === `GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/windows`)
          return Response.json({ windows: opened ? [WIN] : [] });
        if (key === `POST /v1/orgs/${ORG.id}/trips/${TRIP.id}/windows`) {
          posted.push(JSON.parse(String(init?.body)));
          opened = true;
          return Response.json(WIN, { status: 201 });
        }
        return Response.json(
          { error: { code: 'NOT_FOUND', message: key, correlationId: 't' } },
          { status: 404 },
        );
      }),
    );
    renderWithQuery(<SafetyPage />);
    const form = await screen.findByRole('form', { name: 'Open a window' });
    fireEvent.change(within(form).getByLabelText('Label'), { target: { value: 'Hotel lobby' } });
    fireEvent.change(within(form).getByLabelText('Place'), {
      target: { value: 'Hotel Roma lobby' },
    });
    fireEvent.change(within(form).getByLabelText('Radius (m)'), { target: { value: '50' } });
    fireEvent.change(within(form).getByLabelText('Meeting point latitude'), {
      target: { value: '41.9' },
    });
    fireEvent.change(within(form).getByLabelText('Meeting point longitude'), {
      target: { value: '12.5' },
    });
    fireEvent.submit(form);
    await screen.findByText('Meeting window: Hotel lobby');
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      label: 'Hotel lobby',
      place: 'Hotel Roma lobby',
      radiusMeters: 50,
      groups: [],
      center: { lat: 41.9, lng: 12.5 },
    });
    const body = posted[0] as { startsAt: string; endsAt: string };
    expect(new Date(body.endsAt).getTime() - new Date(body.startsAt).getTime()).toBe(45 * 60_000);
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
      confirmations: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          status: 'with_group',
          note: 'Phone lost.',
          confirmedByName: 'Kim',
          confirmedByRole: 'leader',
          confirmedAt: '2026-12-30T22:10:00.000Z',
        },
      ],
      guardianMessage: null,
    };
    const posted: unknown[] = [];
    let resolved = false;
    let messaged = false;
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/windows`]: () => ({ windows: [] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/headcounts`]: () => ({ headcounts: [] }),
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
          : [
              messaged
                ? {
                    ...INC,
                    guardianMessage: {
                      bodyEn:
                        'Juho Kim is with the group. Phone lost. Confirmed by leader Kim at 07:10.',
                      bodyKo:
                        'Juho Kim 학생은 그룹과 함께 있습니다. Phone lost. 인솔자 Kim 님이 07:10에 확인했습니다.',
                      sentAt: INC.openedAt,
                      sentByName: 'Organizer',
                    },
                  }
                : INC,
            ],
      }),
      [`POST /v1/orgs/${ORG.id}/trips/${TRIP.id}/incidents/${INC.id}/guardian-message`]: () => {
        messaged = true;
        return INC;
      },
      [`POST /v1/orgs/${ORG.id}/trips/${TRIP.id}/incidents/${INC.id}/resolve`]: () => {
        posted.push(1);
        resolved = true;
        return { ...INC, status: 'resolved', resolvedByName: 'Organizer' };
      },
    });
    renderWithQuery(<SafetyPage />);
    const card = await screen.findByTestId(`incident-${INC.id}`);
    await screen.findByTestId('no-window');
    expect(text(card)).toContain('Juho Kim');
    expect(text(card)).toContain('Open');
    expect(text(screen.getByRole('heading', { level: 1 }).parentElement)).toContain(
      '1 open incident',
    );
    expect(text(within(card).getByTestId(`confirmation-${INC.id}`))).toContain('With the group');
    expect(text(within(card).getByTestId(`confirmation-${INC.id}`))).toContain(
      'Confirmed by leader Kim',
    );
    fireEvent.click(within(card).getByRole('button', { name: 'Send guardian message' }));
    await waitFor(() =>
      expect(text(screen.getByTestId(`guardian-${INC.id}`))).toContain(
        'Confirmed by leader Kim at 07:10.',
      ),
    );
    expect(text(screen.getByTestId(`guardian-${INC.id}`))).toContain('인솔자 Kim');
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

  it('Safety: the live missing list names the latest closed head count per group', async () => {
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/incidents`]: () => ({ incidents: [] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/windows`]: () => ({ windows: [] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/headcounts`]: () => ({
        headcounts: [
          {
            id: '11111111-bbbb-4bbb-8bbb-111111111111',
            tripId: TRIP.id,
            groupName: 'Bus A',
            openedByName: 'Kim',
            openedAtDevice: '06:50',
            closedAtDevice: '06:58',
            receivedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
            expected: 2,
            present: 1,
            accounted: 1,
            missing: [
              {
                participationId: 'p2',
                displayName: 'Juho Kim',
                groupName: 'Bus A',
                mark: 'missing',
              },
            ],
            closedWithMissing: true,
          },
          {
            id: '22222222-bbbb-4bbb-8bbb-222222222222',
            tripId: TRIP.id,
            groupName: 'Bus A',
            openedByName: 'Kim',
            openedAtDevice: '06:00',
            closedAtDevice: '06:05',
            receivedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
            expected: 2,
            present: 0,
            accounted: 0,
            missing: [
              {
                participationId: 'p1',
                displayName: 'Minji Park',
                groupName: 'Bus A',
                mark: 'missing',
              },
              {
                participationId: 'p2',
                displayName: 'Juho Kim',
                groupName: 'Bus A',
                mark: 'missing',
              },
            ],
            closedWithMissing: true,
          },
        ],
      }),
    });
    renderWithQuery(<SafetyPage />);
    // The fixture list shows while the organization loads; wait for the live group line.
    await screen.findByText(/Bus A · closed 06:58 by Kim · 1 missing/);
    const list = screen.getByTestId('missing-list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(text(items[0] ?? null)).toContain('Juho Kim');
    expect(text(items[0] ?? null)).toContain('Bus A · closed 06:58 by Kim · 1 missing');
    expect(text(items[0] ?? null)).toContain('Missing');
  });

  it('Reports: the live report fills the tiles and the day charts, and exports CSV', async () => {
    const REPORT = {
      generatedAt: '2026-12-29T09:00:00.000Z',
      announcements: { total: 3, requiringAck: 2, avgAckRate: 80 },
      headcounts: {
        total: 3,
        closed: 2,
        closedWithMissing: 1,
        avgCloseMinutes: 10,
        lastCloseMinutes: 12,
      },
      incidents: { open: 1, resolved: 1, avgResolveMinutes: 30 },
      fees: {
        currency: 'KRW',
        expectedMinor: 1000,
        collectedMinor: 250,
        refundedMinor: 0,
        paid: 0,
        partial: 1,
        unpaid: 3,
        refunded: 0,
        collectedPct: 25,
      },
      byDay: [
        {
          day: 1,
          date: '2026-12-28',
          announcementsSent: 1,
          ackRate: 70,
          headcounts: 1,
          avgCloseMinutes: 8,
          missing: 0,
        },
        {
          day: 2,
          date: '2026-12-29',
          announcementsSent: 2,
          ackRate: 90,
          headcounts: 2,
          avgCloseMinutes: 12,
          missing: 1,
        },
      ],
      missingNow: [],
    };
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/report`]: () => REPORT,
    });
    renderWithQuery(<ReportsPage />);
    await waitFor(() => expect(text(screen.getByTestId('kpi-Average ack rate'))).toBe('80%'));
    expect(text(screen.getByTestId('kpi-Last head count closed in'))).toBe('12 min');
    expect(text(screen.getByTestId('kpi-Open incidents'))).toBe('1');
    expect(text(screen.getByTestId('kpi-Fees collected'))).toBe('25%');
    expect(screen.getAllByText('Live').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'D2: 90%' })).toBeTruthy();
    expect(reportCsv(REPORT.byDay)).toBe(
      'day,date,announcements_sent,ack_rate_pct,headcounts,avg_close_minutes,missing\n1,2026-12-28,1,70,1,8,0\n2,2026-12-29,2,90,2,12,1\n',
    );
  });

  it('Reports: KPIs derive from day metrics and documents', () => {
    stubApi({ 'GET /v1/orgs': () => ({ organizations: [] }) });
    renderWithQuery(<ReportsPage />);
    expect(text(screen.getByTestId('kpi-Average ack rate'))).toBe('86%');
    expect(text(screen.getByTestId('kpi-Last head count closed in'))).toBe('6 min');
    expect(text(screen.getByTestId('kpi-Required documents'))).toBe('97%');
    expect(screen.getAllByText('Table view')).toHaveLength(2);
  });

  it('Billing: ledger totals and per-row status chips', () => {
    stubApi({});
    renderWithQuery(<BillingPage />);
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

describe('Settings on the API (slice 036)', () => {
  const PROFILE = {
    ...ORG,
    settings: {
      timeZone: 'Asia/Seoul',
      quietHours: { from: '23:00', to: '06:30' },
      guardianDigestAt: '19:00',
      wrapUpDays: 90,
    },
  };
  const MEMBERS = {
    members: [
      {
        accountId: '44444444-4444-4444-8444-444444444444',
        email: 'nate@example.com',
        role: 'owner',
        joinedAt: '2026-10-11T00:00:00.000Z',
        you: true,
      },
      {
        accountId: '55555555-5555-4555-8555-555555555555',
        email: 'kim@example.com',
        role: 'leader',
        joinedAt: '2026-10-12T00:00:00.000Z',
        you: false,
      },
    ],
  };

  it('loads the profile and members, saves the profile card, and reports Saved.', async () => {
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}`]: () => PROFILE,
      [`GET /v1/orgs/${ORG.id}/members`]: () => MEMBERS,
      [`PATCH /v1/orgs/${ORG.id}`]: () => ({
        ...PROFILE,
        name: 'Seoul Arts High School',
        settings: { ...PROFILE.settings, timeZone: 'Europe/Rome' },
      }),
    });
    renderWithQuery(<SettingsPage />);
    await screen.findByText('Live');
    const name = (await screen.findByLabelText('Name')) as HTMLInputElement;
    expect(name.value).toBe('Seoul Arts High');
    const owner = await screen.findByTestId('member-owner');
    expect(owner.textContent).toContain('nate@example.com');
    expect(owner.textContent).toContain('you');
    expect(screen.getByTestId('member-leader').textContent).toContain('Leader');
    fireEvent.change(name, { target: { value: 'Seoul Arts High School' } });
    fireEvent.change(screen.getByLabelText(/^Time zone/), { target: { value: 'Europe/Rome' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Organization' }));
    await waitFor(() =>
      expect(screen.getByTestId('settings-profile-status').textContent).toBe('Saved.'),
    );
    const patch = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
      name: 'Seoul Arts High School',
      defaultLocale: 'ko',
      settings: { timeZone: 'Europe/Rome' },
    });
    // The server's answer flows back into the inputs without a remount.
    await waitFor(() =>
      expect((screen.getByLabelText(/^Time zone/) as HTMLInputElement).value).toBe('Europe/Rome'),
    );
    // The retention window is checked on the client before any call.
    fireEvent.change(screen.getByLabelText(/^Wrap-up window/), {
      target: { value: '10' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Retention' }));
    expect(screen.getByTestId('settings-retention-status').textContent).toBe(
      'Between 30 and 365 days.',
    );
  });

  it('an organizer sees the values with Save disabled', async () => {
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [{ ...ORG, role: 'organizer' }] }),
      [`GET /v1/orgs/${ORG.id}`]: () => ({ ...PROFILE, role: 'organizer' }),
      [`GET /v1/orgs/${ORG.id}/members`]: () => MEMBERS,
    });
    renderWithQuery(<SettingsPage />);
    // The fixture flashes while the organization loads; wait for the live chip.
    await screen.findByText('Live');
    const saves = await screen.findAllByRole('button', { name: 'Save' });
    expect(saves).toHaveLength(3);
    for (const b of saves) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('settings-profile-status').textContent).toContain('Only the owner');
  });
});
