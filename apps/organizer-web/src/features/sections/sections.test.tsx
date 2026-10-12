// Copyright 2026- At Day. All rights reserved.
// Facts: every sample section renders its heading and the "Sample data" chip; counts derive from
// the fixtures; People filters narrow the table; chart scale helper rounds to clean maxima.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromApiEvent } from '../../lib/itinerary-api';
import { BillingPage } from './BillingPage';
import { CommunicationPage } from './CommunicationPage';
import { niceMax } from './charts';
import { JourneyGraphPage, propagate } from './JourneyGraphPage';
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
      // Slice 066: the fee column from the ledger; Juho has no row yet.
      [`GET ${base}/fees`]: () => ({
        currency: 'KRW',
        withoutFee: 1,
        totals: {
          expectedMinor: 450000,
          collectedMinor: 450000,
          refundedMinor: 0,
          paid: 1,
          partial: 0,
          unpaid: 0,
          refunded: 0,
        },
        rows: [
          {
            participationId: 'p1',
            displayName: 'Minji Park',
            groupName: 'Bus A',
            currency: 'KRW',
            amountDueMinor: 450000,
            paidMinor: 450000,
            refundedMinor: 0,
            dueOn: '2026-11-30',
            note: null,
            status: 'paid',
            updatedAt: '2026-10-12T00:00:00.000Z',
            updatedByName: 'Owner',
          },
        ],
      }),
    });
    renderWithQuery(<PeoplePage />);
    await waitFor(() => expect(screen.getByTestId('person-p1')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('fee-p1')).toBeTruthy());
    expect(text(screen.getByTestId('fee-p1'))).toBe('Paid');
    expect(text(screen.getByTestId('fee-p2'))).toBe('—');
    expect(text(screen.getByTestId('fee-p3'))).toBe('No fee');
    // Slice 071: the roster's export link.
    expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe(
      `${base}/roster/export.csv`,
    );
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
    // Slice 066: the ledger's export link.
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe(
        `${base}/fees/export.csv`,
      ),
    );
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
      // Slice 065: the organizer removes Sora's message; the tombstone replaces it.
      [`DELETE ${base}/chats/${encodeURIComponent('guardian:p2')}/messages/${first.id}`]: () => {
        const gone = {
          ...first,
          body: '',
          removed: { byName: 'Owner', at: '2026-12-31T06:50:00.000Z' },
        };
        messages.splice(0, 1, gone);
        return gone;
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
    fireEvent.click(within(thread).getByRole('button', { name: 'Remove message from Sora Park' }));
    await waitFor(() =>
      expect(text(screen.getByTestId('chat-messages'))).toContain('Message removed by Owner'),
    );
    expect(text(screen.getByTestId('chat-messages'))).not.toContain('Will the bus be late?');
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
    // Slice 074: a traveler's own request, resolved; the card says where it came from.
    const HELP = {
      ...INC,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      kind: 'help',
      status: 'resolved',
      title: 'I feel sick',
      headcountId: null,
      people: [{ participationId: 'p5', displayName: 'Minji Park', groupName: 'Bus A' }],
      openedByName: 'Minji Park',
      resolvedAt: INC.openedAt,
      resolvedByName: 'Organizer',
      confirmations: [],
    };
    const posted: unknown[] = [];
    let resolved = false;
    let messaged = false;
    const manual: unknown[] = [];
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/windows`]: () => ({ windows: [] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/headcounts`]: () => ({ headcounts: [] }),
      // Slice 068: the composer's travelers, and the card it opens.
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/roster`]: () => ({
        participations: [
          {
            id: 'p2',
            tripId: TRIP.id,
            role: 'traveler',
            displayName: 'Juho Kim',
            groupName: 'Bus A',
            guardianOf: null,
            accountId: null,
            createdAt: 'x',
            invite: 'none',
            lastAckAt: null,
          },
          {
            id: 'p5',
            tripId: TRIP.id,
            role: 'traveler',
            displayName: 'Minji Park',
            groupName: 'Bus A',
            guardianOf: null,
            accountId: null,
            createdAt: 'x',
            invite: 'none',
            lastAckAt: null,
          },
          {
            id: 'p9',
            tripId: TRIP.id,
            role: 'guardian',
            displayName: 'Sora Park',
            groupName: 'Bus A',
            guardianOf: 'p5',
            accountId: null,
            createdAt: 'x',
            invite: 'none',
            lastAckAt: null,
          },
        ],
      }),
      [`POST /v1/orgs/${ORG.id}/trips/${TRIP.id}/incidents`]: () => {
        const card = {
          ...INC,
          id: '99999999-9999-4999-8999-999999999999',
          kind: 'manual',
          title: 'Lost passport at the hotel desk',
          headcountId: null,
          people: [{ participationId: 'p5', displayName: 'Minji Park', groupName: 'Bus A' }],
          openedByName: 'Owner',
          confirmations: [],
        };
        manual.push(card);
        return card;
      },
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/incidents`]: () => ({
        incidents: [
          ...manual,
          ...(resolved
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
              ]),
          HELP,
        ],
      }),
      [`POST /v1/orgs/${ORG.id}/trips/${TRIP.id}/incidents/${INC.id}/guardian-message`]: () => {
        messaged = true;
        return INC;
      },
      // Slice 064: the audited read of Bus A's channel.
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/chats/group%3ABus%20A/messages`]: () => ({
        channel: {
          id: 'group:Bus A',
          kind: 'group',
          title: 'Bus A',
          subtitle: '2 travelers · 1 leader',
          unread: 0,
          lastMessage: null,
        },
        messages: [
          {
            id: '88888888-8888-4888-8888-888888888888',
            channelId: 'group:Bus A',
            senderName: 'Kim',
            senderRole: 'leader',
            body: 'Juho went to find the toilets.',
            sentAt: '2026-12-30T21:50:00.000Z',
            mine: false,
          },
        ],
        audited: { incidentId: INC.id, incidentTitle: INC.title },
      }),
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
    expect(text(card)).not.toContain('Asked for help from the phone');
    expect(text(screen.getByTestId(`incident-${HELP.id}`))).toContain(
      'I feel sick Asked for help from the phone',
    );
    // Slice 064: the group's and the traveler's channels can be read, audited; Close folds it.
    expect(
      within(card)
        .getAllByRole('button', { name: /channel \(audited\)/ })
        .map((b) => b.textContent),
    ).toEqual(["Read Bus A's channel (audited)", "Read Juho Kim's channel (audited)"]);
    fireEvent.click(within(card).getByRole('button', { name: "Read Bus A's channel (audited)" }));
    await screen.findByText('Juho went to find the toilets.');
    expect(text(screen.getByTestId('audited-thread'))).toContain(
      "Recorded on each traveler's timeline · Head count closed with 1 missing (Bus A, 06:58)",
    );
    fireEvent.click(within(card).getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('audited-thread')).toBeNull();
    // Slice 068: a card opened by hand, naming Minji; it leads the list.
    fireEvent.click(screen.getByRole('button', { name: 'New incident' }));
    const form = await screen.findByRole('form', { name: 'New incident' });
    await within(form).findByLabelText('Minji Park · Bus A');
    fireEvent.change(within(form).getByLabelText('What happened'), {
      target: { value: 'Lost passport at the hotel desk' },
    });
    fireEvent.click(within(form).getByLabelText('Minji Park · Bus A'));
    fireEvent.click(within(form).getByRole('button', { name: 'Open incident' }));
    await screen.findByText('Lost passport at the hotel desk');
    expect(screen.queryByRole('form', { name: 'New incident' })).toBeNull();
    expect(
      within(screen.getByTestId('incident-list')).getAllByRole('listitem')[0]?.textContent,
    ).toContain('Lost passport at the hotel desk');
    expect(text(card)).toContain('Open');
    // Two open now: the head count's card and the one opened by hand.
    expect(text(screen.getByRole('heading', { level: 1 }).parentElement)).toContain(
      '2 open incidents',
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
    stubApi({});
    renderWithQuery(<JourneyGraphPage />);
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
    stubApi({});
    renderWithQuery(<MediaPage />);
    expect(within(screen.getByTestId('media-queue')).getAllByRole('listitem')).toHaveLength(3);
    expect(within(screen.getByTestId('media-pool')).getAllByRole('figure')).toHaveLength(15);
  });

  it('Preparation: per-document counts', () => {
    stubApi({});
    renderWithQuery(<PreparationPage />);
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

  it("the account card saves the organizer's own name (slice 069)", async () => {
    const patched: unknown[] = [];
    let me = {
      accountId: '4',
      email: 'nate@example.com',
      locale: 'en',
      displayName: null as string | null,
      memberships: [],
    };
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      'GET /v1/me': () => me,
      'PATCH /v1/me': () => {
        patched.push(1);
        me = { ...me, displayName: 'Nate Kim' };
        return me;
      },
      [`GET /v1/orgs/${ORG.id}`]: () => PROFILE,
      [`GET /v1/orgs/${ORG.id}/members`]: () => MEMBERS,
      [`GET /v1/orgs/${ORG.id}/invitations`]: () => ({ invitations: [] }),
    });
    renderWithQuery(<SettingsPage />);
    const form = await screen.findByRole('form', { name: 'Your account' });
    fireEvent.change(within(form).getByLabelText('Your name'), { target: { value: ' Nate Kim ' } });
    // Slice 081: the incident emails switch, on by default, saved with the name.
    const emailsLabel =
      'Email me when a card opens from a phone or a head count closes with people missing';
    const emails = within(form).getByLabelText(emailsLabel) as HTMLInputElement;
    expect(emails.checked).toBe(true);
    fireEvent.click(emails);
    fireEvent.submit(form);
    await waitFor(() => expect(patched).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId('settings-account-status').textContent).toBe('Saved.'),
    );
    expect((within(form).getByLabelText('Your name') as HTMLInputElement).value).toBe('Nate Kim');
    const patchCall = vi
      .mocked(fetch)
      .mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
    expect(JSON.parse(String((patchCall?.[1] as RequestInit | undefined)?.body))).toEqual({
      displayName: 'Nate Kim',
      incidentEmails: false,
    });
  });

  it('loads the profile and members, saves the profile card, and reports Saved.', async () => {
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}`]: () => PROFILE,
      [`GET /v1/orgs/${ORG.id}/members`]: () => MEMBERS,
      [`GET /v1/orgs/${ORG.id}/invitations`]: () => ({ invitations: [] }),
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
      [`GET /v1/orgs/${ORG.id}/invitations`]: () => ({ invitations: [PENDING] }),
    });
    renderWithQuery(<SettingsPage />);
    // The fixture flashes while the organization loads; wait for the live chip.
    await screen.findByText('Live');
    const saves = await screen.findAllByRole('button', { name: 'Save' });
    // Slice 069: the account card's Save is the organizer's own; the three organization cards stay owner-only.
    expect(saves).toHaveLength(4);
    expect((saves[0] as HTMLButtonElement).disabled).toBe(false);
    for (const b of saves.slice(1)) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('settings-profile-status').textContent).toContain('Only the owner');
    // Organizers read the invitations but neither send nor revoke (slice 042).
    await screen.findByTestId('invitation-pending');
    expect(screen.queryByRole('form', { name: 'Invite an organizer' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Revoke the invitation/ })).toBeNull();
  });

  const PENDING = {
    id: '66666666-6666-4666-8666-666666666666',
    email: 'kim@example.com',
    role: 'organizer',
    status: 'pending',
    invitedBy: 'nate@example.com',
    createdAt: '2026-10-12T09:00:00.000Z',
    expiresAt: '2026-10-19T09:00:00.000Z',
    acceptedAt: null,
    revokedAt: null,
  };

  it('the owner invites an organizer and revokes the pending invitation (slice 042)', async () => {
    let invitations: unknown[] = [];
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}`]: () => PROFILE,
      [`GET /v1/orgs/${ORG.id}/members`]: () => MEMBERS,
      [`GET /v1/orgs/${ORG.id}/invitations`]: () => ({ invitations }),
      [`POST /v1/orgs/${ORG.id}/invitations`]: () => {
        invitations = [PENDING];
        return PENDING;
      },
      [`DELETE /v1/orgs/${ORG.id}/invitations/${PENDING.id}`]: () => {
        const revoked = { ...PENDING, status: 'revoked', revokedAt: '2026-10-12T10:00:00.000Z' };
        invitations = [revoked];
        return revoked;
      },
    });
    renderWithQuery(<SettingsPage />);
    await screen.findByText('Live');
    expect(await screen.findByText('No invitations yet.')).toBeTruthy();
    const form = await screen.findByRole('form', { name: 'Invite an organizer' });
    const send = within(form).getByRole('button', { name: 'Send invitation' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText('Email'), {
      target: { value: 'kim@example.com' },
    });
    expect(send.disabled).toBe(false);
    fireEvent.submit(form);
    await waitFor(() =>
      expect(screen.getByTestId('settings-invite-status').textContent).toBe(
        'Invitation sent to kim@example.com.',
      ),
    );
    const post = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ email: 'kim@example.com' });
    const row = await screen.findByTestId('invitation-pending');
    expect(row.textContent).toContain('kim@example.com');
    expect(row.textContent).toContain('Pending');
    expect(row.textContent).toContain('Link works until 2026-10-19');
    fireEvent.click(
      screen.getByRole('button', { name: 'Revoke the invitation of kim@example.com' }),
    );
    const revoked = await screen.findByTestId('invitation-revoked');
    expect(revoked.textContent).toContain('Revoked');
    expect(screen.queryByRole('button', { name: /^Revoke the invitation/ })).toBeNull();
  });
});

describe('Media on the API (slice 043)', () => {
  const base = `/v1/orgs/${ORG.id}/trips/${TRIP.id}`;
  const photo = (p: Partial<Record<string, unknown>> & { id: string }) => ({
    tripId: TRIP.id,
    uploaderName: 'Minji Park',
    uploaderRole: 'traveler',
    mine: false,
    day: 4,
    takenAt: '2026-12-29T00:30:00.000Z',
    contentType: 'image/png',
    bytes: 1200,
    thumbnailBytes: 300,
    status: 'pool',
    flag: null,
    reviewedByName: null,
    album: null,
    uploadedAt: '2026-12-29T00:31:00.000Z',
    thumbnailUrl: `${base}/media/${p.id}/thumbnail`,
    contentUrl: `${base}/media/${p.id}/content`,
    ...p,
  });
  const ROSTER = {
    participations: [
      {
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
      },
      {
        id: 'p2',
        tripId: TRIP.id,
        role: 'guardian',
        displayName: 'Sora Park',
        groupName: 'Bus A',
        guardianOf: 'p1',
        accountId: null,
        createdAt: '2026-10-11T00:00:00.000Z',
        invite: 'none',
        lastAckAt: null,
      },
    ],
  };

  it('lists the pool, the queue and the album; approves, tags and deletes through the API', async () => {
    let photos: Record<string, unknown>[] = [
      photo({ id: 'ph1', status: 'flagged', flag: 'nudity', uploaderName: 'Juho Kim', day: 0 }),
      photo({ id: 'ph2' }),
      photo({
        id: 'ph3',
        status: 'approved',
        album: {
          at: '2026-12-29T01:00:00.000Z',
          byName: 'Kim',
          wholeGroup: true,
          participationIds: [],
          taggedNames: [],
        },
      }),
    ];
    const counts = () => ({
      pool: photos.filter((p) => p.status !== 'flagged').length,
      flagged: photos.filter((p) => p.status === 'flagged').length,
      approved: photos.filter((p) => p.status === 'approved').length,
    });
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET ${base}/roster`]: () => ROSTER,
      [`GET ${base}/media`]: () => ({ photos, counts: counts() }),
      [`POST ${base}/media/ph1/review`]: () => {
        photos = photos.map((p) =>
          p.id === 'ph1' ? { ...p, status: 'pool', reviewedByName: 'Owner' } : p,
        );
        return photos[0];
      },
      [`PUT ${base}/media/ph2/album`]: () => {
        const album = {
          at: '2026-12-29T02:00:00.000Z',
          byName: 'Owner',
          wholeGroup: false,
          participationIds: ['p1'],
          taggedNames: ['Minji Park'],
        };
        photos = photos.map((p) => (p.id === 'ph2' ? { ...p, status: 'approved', album } : p));
        return photos[1];
      },
      [`DELETE ${base}/media/ph3`]: () => {
        photos = photos.filter((p) => p.id !== 'ph3');
        return { deleted: true, photoId: 'ph3' };
      },
    });
    renderWithQuery(<MediaPage />);
    await screen.findByText('Live');
    await waitFor(() => expect(screen.getAllByTestId('media-flagged')).toHaveLength(1));
    expect(text(screen.getByRole('heading', { level: 1 }).parentElement)).toContain(
      '3 photos · 1 in the guardian album · 1 awaiting review',
    );
    expect(within(screen.getByTestId('media-pool')).getAllByRole('figure')).toHaveLength(2);
    expect(screen.getByTestId('media-flagged').textContent).toContain('Possible nudity');
    expect(screen.getByTestId('media-flagged').textContent).toContain('Outside the trip dates');
    expect(text(screen.getByTestId('media-album-counts'))).toContain('1 approved photos');

    // Approve the flagged one: it leaves the queue and joins the pool.
    fireEvent.click(screen.getByRole('button', { name: 'Approve the photo by Juho Kim' }));
    await waitFor(() => expect(screen.queryByTestId('media-flagged')).toBeNull());
    expect(within(screen.getByTestId('media-pool')).getAllByRole('figure')).toHaveLength(3);
    const review = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith('/media/ph1/review'));
    expect(JSON.parse(String(review?.[1]?.body))).toEqual({ decision: 'clear' });

    // Tag Minji's photo with Minji: the PUT carries the ids; the album counts follow.
    fireEvent.click(
      screen.getByRole('button', { name: 'Add the photo by Minji Park to the album' }),
    );
    const panel = screen.getByRole('form', { name: 'Album tags for the photo by Minji Park' });
    const save = within(panel).getByRole('button', { name: 'Save to album' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(within(panel).getByLabelText('Minji Park'));
    expect(save.disabled).toBe(false);
    fireEvent.submit(panel);
    await waitFor(() =>
      expect(text(screen.getByTestId('media-album-counts'))).toContain('2 approved photos'),
    );
    const put = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({
      wholeGroup: false,
      participationIds: ['p1'],
    });
    expect(screen.getByTestId('media-album').textContent).toContain('Minji Park');
    expect(screen.getByTestId('media-album').textContent).toContain('Whole group');

    // Delete the group shot.
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Delete the photo by Minji Park' })[1] as HTMLElement,
    );
    await waitFor(() =>
      expect(within(screen.getByTestId('media-pool')).getAllByRole('figure')).toHaveLength(2),
    );
    const del = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(String(del?.[0])).toBe(`${base}/media/ph3`);
  });

  it('uploads through multipart with the file and the taken-at time', async () => {
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET ${base}/roster`]: () => ROSTER,
      [`GET ${base}/media`]: () => ({ photos: [], counts: { pool: 0, flagged: 0, approved: 0 } }),
      [`POST ${base}/media`]: () => photo({ id: 'ph9', mine: true, uploaderName: 'Owner' }),
    });
    renderWithQuery(<MediaPage />);
    await screen.findByText('Live');
    expect(
      await screen.findByText(
        'No photos yet. Upload the first, or wait for leaders and travelers.',
      ),
    ).toBeTruthy();
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'bus.png', {
      type: 'image/png',
      lastModified: Date.parse('2026-12-29T09:30:00Z'),
    });
    fireEvent.change(screen.getByTestId('photo-input'), { target: { files: [file] } });
    await waitFor(() =>
      expect(screen.getByTestId('media-status').textContent).toBe('1 photo uploaded.'),
    );
    const post = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST');
    const form = post?.[1]?.body as FormData;
    expect(form.get('original')).toBeInstanceOf(File);
    expect((form.get('original') as File).name).toBe('bus.png');
    expect(form.get('takenAt')).toBe('2026-12-29T09:30:00.000Z');
    // jsdom has no canvas: the original goes alone and the server makes do (it is tiny).
    expect(form.get('thumbnail')).toBeNull();
  });
});

describe('Preparation on the API (slice 045)', () => {
  const base = `/v1/orgs/${ORG.id}/trips/${TRIP.id}`;
  const REQ = {
    id: '77777777-7777-4777-8777-777777777777',
    tripId: TRIP.id,
    name: 'Passport copy',
    required: true,
    dueOn: '2026-12-10',
    createdAt: '2026-10-12T00:00:00.000Z',
    counts: { travelers: 3, collected: 1, waived: 0, missing: 2, scans: 1 },
  };
  const item = (
    p: Partial<Record<string, unknown>> & { participationId: string; displayName: string },
  ) => ({
    requirementId: REQ.id,
    groupName: 'Bus A',
    state: 'missing',
    updatedAt: null,
    updatedByName: null,
    scan: null,
    reveals: 0,
    ...p,
  });
  const ITEMS = {
    requirement: REQ,
    items: [
      item({
        participationId: 'p1',
        displayName: 'Juho Kim',
        state: 'collected',
        scan: {
          contentType: 'application/pdf',
          bytes: 1200,
          uploadedAt: '2026-10-12T01:00:00.000Z',
          uploadedByName: 'Owner',
        },
      }),
      item({ participationId: 'p2', displayName: 'Minji Park' }),
    ],
  };

  it('lists requirements, adds one, opens it, sets a state, uploads a scan, and asks to confirm before a reveal', async () => {
    let requirements: Record<string, unknown>[] = [REQ];
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${init?.method ?? 'GET'} ${String(input)}`;
        calls.push(key);
        if (key === 'GET /v1/orgs') return Response.json({ organizations: [ORG] });
        if (key === `GET /v1/orgs/${ORG.id}/trips`) return Response.json({ trips: [TRIP] });
        if (key === 'GET /v1/me')
          return Response.json({
            accountId: 'a',
            email: 'nate@example.com',
            locale: 'en',
            displayName: null,
            memberships: [],
          });
        if (key === `GET ${base}/documents`)
          return Response.json({ requirements, travelers: 3, missingRequired: 2 });
        if (key === `POST ${base}/documents`) {
          const created = {
            ...REQ,
            id: '88888888-8888-4888-8888-888888888888',
            name: 'Consent form',
            required: false,
            dueOn: null,
            counts: { travelers: 3, collected: 0, waived: 0, missing: 3, scans: 0 },
          };
          requirements = [...requirements, created];
          return Response.json(created, { status: 201 });
        }
        if (key === `GET ${base}/documents/${REQ.id}/items`) return Response.json(ITEMS);
        if (key === `PUT ${base}/documents/${REQ.id}/items/p2`)
          return Response.json({ ...ITEMS.items[1], state: 'collected' });
        if (key === `POST ${base}/documents/${REQ.id}/items/p2/scan`)
          return Response.json({ ...ITEMS.items[1], state: 'collected' }, { status: 201 });
        if (key === `POST ${base}/documents/${REQ.id}/items/p1/scan/reveal`) {
          return Response.json(
            {
              error: {
                code: 'REAUTH_REQUIRED',
                message: 'Confirm it is you first.',
                correlationId: 'c',
              },
            },
            { status: 403 },
          );
        }
        if (key === 'POST /v1/auth/reauth')
          return Response.json({ accepted: true, expiresInSeconds: 900 }, { status: 202 });
        return Response.json(
          { error: { code: 'NOT_FOUND', message: key, correlationId: 't' } },
          { status: 404 },
        );
      }),
    );
    renderWithQuery(<PreparationPage />);
    await screen.findByText('Live');
    const row = await screen.findByTestId(`req-${REQ.id}`);
    expect(row.textContent).toContain('Passport copy');
    expect(screen.getByTestId(`doc-${REQ.id}`).textContent).toBe('1/3');
    expect(text(screen.getByRole('heading', { level: 1 }).parentElement)).toContain(
      '2 required documents still missing across 3 travelers',
    );

    // Add a requirement.
    const form = screen.getByRole('form', { name: 'Add a requirement' });
    fireEvent.change(within(form).getByLabelText('Document'), {
      target: { value: 'Consent form' },
    });
    fireEvent.click(within(form).getByLabelText('Required'));
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText('Consent form')).toBeTruthy());
    const post = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      name: 'Consent form',
      required: false,
      dueOn: null,
    });

    // Open the passport requirement: the travelers table; Minji becomes collected.
    fireEvent.click(screen.getByRole('button', { name: 'Open Passport copy' }));
    await screen.findByTestId('item-p2');
    expect(screen.getByTestId('item-p1').textContent).toContain('PDF on file · uploaded by Owner');
    fireEvent.change(screen.getByLabelText('State of Minji Park'), {
      target: { value: 'collected' },
    });
    await waitFor(() => expect(calls).toContain(`PUT ${base}/documents/${REQ.id}/items/p2`));
    const put = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ state: 'collected' });

    // Upload a scan for Minji: multipart with the file.
    fireEvent.click(screen.getByRole('button', { name: 'Upload a scan for Minji Park' }));
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'minji.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(screen.getByTestId('scan-input'), { target: { files: [file] } });
    await waitFor(() => expect(calls).toContain(`POST ${base}/documents/${REQ.id}/items/p2/scan`));
    const scanPost = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith('/items/p2/scan'));
    const scanBody = scanPost?.[1]?.body as FormData | undefined;
    expect(scanBody?.get('file')).toBeInstanceOf(File);

    // Reveal Juho's scan: 403 REAUTH_REQUIRED stores the return path, sends the link, says so.
    fireEvent.click(screen.getByRole('button', { name: 'Reveal the scan of Juho Kim' }));
    await waitFor(() =>
      expect(screen.getByTestId('items-status').textContent).toContain('confirm it is you'),
    );
    expect(calls).toContain('POST /v1/auth/reauth');
    expect(localStorage.getItem('voysemble.reauth.next')).toBe('/preparation');
    expect(screen.queryByTestId('scan-viewer')).toBeNull();
    localStorage.clear();
  });
  it('nudges the travelers still missing a document and their guardians (slice 060)', async () => {
    let reminds = 0;
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      'GET /v1/me': () => ({
        accountId: 'a',
        email: 'nate@example.com',
        locale: 'en',
        displayName: null,
        memberships: [],
      }),
      [`GET ${base}/documents`]: () => ({ requirements: [REQ], travelers: 3, missingRequired: 2 }),
      [`GET ${base}/packing`]: () => ({ items: [], travelers: [], ready: 0 }),
      [`POST ${base}/documents/${REQ.id}/remind`]: () => {
        reminds += 1;
        return reminds === 1
          ? { missing: 2, reminded: 3, skipped: 0 }
          : { missing: 2, reminded: 0, skipped: 3 };
      },
    });
    renderWithQuery(<PreparationPage />);
    await screen.findByText('Live');
    const button = await screen.findByRole('button', { name: 'Remind about Passport copy' });
    expect(button.textContent).toBe('Remind 2');
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByTestId('remind-status').textContent).toBe(
        'Reminded 3 people (travelers and their guardians).',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remind about Passport copy' }));
    await waitFor(() =>
      expect(screen.getByTestId('remind-status').textContent).toBe(
        'Everyone missing it was already reminded today.',
      ),
    );
  });
});

describe('Travel on the API (slice 046)', () => {
  const base = `/v1/orgs/${ORG.id}/trips/${TRIP.id}`;
  const FLIGHT = {
    id: '99999999-9999-4999-8999-999999999999',
    tripId: TRIP.id,
    kind: 'flight',
    code: 'DEMO 901',
    from: 'ICN',
    to: 'FCO',
    departsAt: '2026-12-28T13:30',
    arrivesAt: '2026-12-28T18:55',
    pax: 42,
    pnr: 'VYS8K2',
    status: 'scheduled',
    createdAt: '2026-10-12T00:00:00.000Z',
  };
  const BUS = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tripId: TRIP.id,
    kind: 'bus',
    label: 'Bus A',
    company: 'Roma Coach',
    seats: 24,
    driverContact: '+39 333 000 0000',
    groups: ['Bus A'],
    assigned: 2,
    createdAt: '2026-10-12T00:00:00.000Z',
  };

  const LINK = {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    tripId: TRIP.id,
    bookingId: BUS.id,
    createdAt: '2026-10-12T01:00:00.000Z',
    expiresAt: '2026-11-11T01:00:00.000Z',
    revokedAt: null,
    opens: 0,
    lastOpenedAt: null,
  };

  it('lists the plan, adds a hotel, sets a flight status, and removes a bus', async () => {
    let hotels: Record<string, unknown>[] = [];
    let buses: Record<string, unknown>[] = [BUS];
    let flight: Record<string, unknown> = FLIGHT;
    let linkMinted = false;
    let hotelLinkMinted = false;
    const HOTEL_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let roomingList = {
      hotel: {
        id: HOTEL_ID,
        name: 'Hotel de la Ville',
        city: 'Rome',
        checkIn: '2026-12-28',
        checkOut: '2027-01-02',
        rooms: 21,
      },
      people: [
        {
          participationId: 'p-kim',
          displayName: 'Kim',
          role: 'leader',
          groupName: 'Bus A',
          room: null as string | null,
        },
        {
          participationId: 'p-juho',
          displayName: 'Juho Kim',
          role: 'traveler',
          groupName: 'Bus A',
          room: null as string | null,
        },
        {
          participationId: 'p-minji',
          displayName: 'Minji Park',
          role: 'traveler',
          groupName: 'Bus A',
          room: null as string | null,
        },
      ],
      roomsUsed: 0,
      assigned: 0,
    };
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${init?.method ?? 'GET'} ${String(input)}`;
        calls.push(key);
        if (key === 'GET /v1/orgs') return Response.json({ organizations: [ORG] });
        if (key === `GET /v1/orgs/${ORG.id}/trips`) return Response.json({ trips: [TRIP] });
        if (key === `GET ${base}/travel`)
          return Response.json({
            flights: [flight],
            hotels,
            buses,
            groups: ['Bus A', 'Bus B'],
            travelers: 3,
          });
        if (key === `POST ${base}/travel`) {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          const created = {
            ...body,
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            tripId: TRIP.id,
            nights: 5,
            createdAt: '2026-10-12T01:00:00.000Z',
          };
          hotels = [...hotels, created];
          return Response.json(created, { status: 201 });
        }
        if (key === `PATCH ${base}/travel/${FLIGHT.id}`) {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          flight = { ...flight, ...body };
          return Response.json(flight);
        }
        if (key === `DELETE ${base}/travel/${BUS.id}`) {
          buses = [];
          return Response.json({ deleted: true, bookingId: BUS.id });
        }
        // Slice 058: the hotel's rooming list and link.
        if (key === `GET ${base}/travel/${HOTEL_ID}/rooming`) return Response.json(roomingList);
        if (key === `PUT ${base}/travel/${HOTEL_ID}/rooming`) {
          const body = JSON.parse(String(init?.body)) as {
            participationId: string;
            room: string | null;
          };
          roomingList = {
            ...roomingList,
            people: roomingList.people.map((p) =>
              p.participationId === body.participationId ? { ...p, room: body.room } : p,
            ),
          };
          roomingList.assigned = roomingList.people.filter((p) => p.room !== null).length;
          roomingList.roomsUsed = new Set(
            roomingList.people.map((p) => p.room).filter(Boolean),
          ).size;
          return Response.json(roomingList);
        }
        if (key === `GET ${base}/travel/${HOTEL_ID}/hotel-links`)
          return Response.json({
            links: hotelLinkMinted ? [{ ...LINK, bookingId: HOTEL_ID }] : [],
          });
        if (key === `POST ${base}/travel/${HOTEL_ID}/hotel-links`) {
          hotelLinkMinted = true;
          return Response.json(
            {
              link: { ...LINK, bookingId: HOTEL_ID },
              url: `https://app.example/hotel/${ORG.id}#token=${'h'.repeat(43)}`,
            },
            { status: 201 },
          );
        }
        if (key === `GET ${base}/travel/${BUS.id}/driver-links`)
          return Response.json({ links: linkMinted ? [LINK] : [] });
        if (key === `POST ${base}/travel/${BUS.id}/driver-links`) {
          linkMinted = true;
          return Response.json(
            { link: LINK, url: `https://app.example/driver/${ORG.id}#token=${'t'.repeat(43)}` },
            { status: 201 },
          );
        }
        if (key === `DELETE ${base}/travel/${BUS.id}/driver-links/${LINK.id}`)
          return Response.json({ ...LINK, revokedAt: '2026-10-12T02:00:00.000Z' });
        return Response.json(
          { error: { code: 'NOT_FOUND', message: key, correlationId: 't' } },
          { status: 404 },
        );
      }),
    );
    renderWithQuery(<TravelPage />);
    await screen.findByText('Live');
    const row = await screen.findByTestId(`booking-${FLIGHT.id}`);
    expect(row.textContent).toContain('ICN → FCO');
    expect(row.textContent).toContain('13:30 → 18:55');
    expect(row.textContent).toContain('42 seats');
    expect(text(screen.getByRole('heading', { level: 1 }).parentElement)).toContain(
      '1 flights · 0 hotels · 1 buses · 3 travelers to move',
    );
    expect(screen.getByTestId(`booking-${BUS.id}`).textContent).toContain('2 of 24 seats assigned');
    expect(screen.getByText('No hotels yet.')).toBeTruthy();

    // Add a hotel: the POST carries the hotel kind; the row reads the nights.
    const form = screen.getByRole('form', { name: 'Add a hotel' });
    fireEvent.change(within(form).getByLabelText('Hotel'), {
      target: { value: 'Hotel de la Ville' },
    });
    fireEvent.change(within(form).getByLabelText('City'), { target: { value: 'Rome' } });
    fireEvent.change(within(form).getByLabelText('Check-in'), {
      target: { value: '2026-12-28' },
    });
    fireEvent.change(within(form).getByLabelText('Check-out'), {
      target: { value: '2027-01-02' },
    });
    fireEvent.change(within(form).getByLabelText('Rooms'), { target: { value: '21' } });
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText('Hotel de la Ville')).toBeTruthy());
    const post = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      kind: 'hotel',
      name: 'Hotel de la Ville',
      city: 'Rome',
      checkIn: '2026-12-28',
      checkOut: '2027-01-02',
      rooms: 21,
      confirmation: '',
    });
    expect(
      screen.getByTestId('booking-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb').textContent,
    ).toContain('5 nights');

    // Slice 058: the rooming list opens under the hotel; a room saves on Enter and the summary
    // follows; the hotel's link mints with the URL shown once.
    fireEvent.click(screen.getByRole('button', { name: 'Rooming list for Hotel de la Ville' }));
    const roomingBox = await screen.findByTestId(`rooming-${HOTEL_ID}`);
    await waitFor(() =>
      expect(roomingBox.textContent).toContain('0 of 3 placed · 0 of 21 rooms used'),
    );
    const minjiRoom = within(roomingBox).getByLabelText('Room of Minji Park');
    fireEvent.change(minjiRoom, { target: { value: '204' } });
    fireEvent.keyDown(minjiRoom, { key: 'Enter' });
    await waitFor(() => expect(roomingBox.textContent).toContain('Minji Park is in room 204.'));
    await waitFor(() =>
      expect(roomingBox.textContent).toContain('1 of 3 placed · 1 of 21 rooms used'),
    );
    const roomPut = vi
      .mocked(fetch)
      .mock.calls.find(([url, init]) => init?.method === 'PUT' && String(url).endsWith('/rooming'));
    expect(JSON.parse(String(roomPut?.[1]?.body))).toEqual({
      participationId: 'p-minji',
      room: '204',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hotel link for Hotel de la Ville' }));
    const hotelUrl = (await screen.findByTestId('hotel-link-url')) as HTMLInputElement;
    expect(hotelUrl.value).toBe(`https://app.example/hotel/${ORG.id}#token=${'h'.repeat(43)}`);
    await waitFor(() =>
      expect(screen.getByTestId('hotel-links').textContent).toContain(
        'Minted 2026-10-12 · expires 2026-11-11 · 0 opens',
      ),
    );

    // The flight is delayed: a PATCH with the kind and the status.
    fireEvent.change(screen.getByLabelText('Status of DEMO 901'), {
      target: { value: 'delayed' },
    });
    await waitFor(() => expect(calls).toContain(`PATCH ${base}/travel/${FLIGHT.id}`));
    const patch = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ kind: 'flight', status: 'delayed' });
    await waitFor(() =>
      expect(screen.getByTestId(`booking-${FLIGHT.id}`).textContent).toContain('Delayed'),
    );

    // Mint the driver's link for the bus (slice 049): the URL shows once; the list reads the opens.
    fireEvent.click(screen.getByRole('button', { name: 'Driver link for Bus A' }));
    const url = (await screen.findByTestId('driver-link-url')) as HTMLInputElement;
    expect(url.value).toBe(`https://app.example/driver/${ORG.id}#token=${'t'.repeat(43)}`);
    await waitFor(() =>
      expect(screen.getByTestId('driver-links').textContent).toContain(
        'Minted 2026-10-12 · expires 2026-11-11 · 0 opens',
      ),
    );
    // The hotel's link was minted the same day (slice 058): scope the revoke to the bus's list.
    fireEvent.click(
      within(screen.getByTestId('driver-links')).getByRole('button', {
        name: 'Revoke the link minted 2026-10-12',
      }),
    );
    await waitFor(() =>
      expect(calls).toContain(`DELETE ${base}/travel/${BUS.id}/driver-links/${LINK.id}`),
    );

    // Remove the bus.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bus A' }));
    await waitFor(() => expect(calls).toContain(`DELETE ${base}/travel/${BUS.id}`));
    await waitFor(() => expect(screen.getByText('No bus charters yet.')).toBeTruthy());
  });
});

describe('Packing checklist on the API (slice 048)', () => {
  const base = `/v1/orgs/${ORG.id}/trips/${TRIP.id}`;
  const ITEM = {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    tripId: TRIP.id,
    name: 'Passport + copy',
    note: '',
    createdAt: '2026-10-12T00:00:00.000Z',
    counts: { travelers: 3, packed: 1 },
  };
  const TRAVELERS = [
    {
      participationId: 'p1',
      displayName: 'Juho Kim',
      groupName: 'Bus A',
      packed: 0,
      total: 1,
      lastPackedAt: null,
    },
    {
      participationId: 'p2',
      displayName: 'Minji Park',
      groupName: 'Bus A',
      packed: 1,
      total: 1,
      lastPackedAt: '2026-10-12T01:00:00.000Z',
    },
    {
      participationId: 'p3',
      displayName: 'Lee Hana',
      groupName: 'Bus B',
      packed: 0,
      total: 1,
      lastPackedAt: null,
    },
  ];

  it('lists the items with their counts, adds one, and removes one', async () => {
    let items: Record<string, unknown>[] = [ITEM];
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${init?.method ?? 'GET'} ${String(input)}`;
        calls.push(key);
        if (key === 'GET /v1/orgs') return Response.json({ organizations: [ORG] });
        if (key === `GET /v1/orgs/${ORG.id}/trips`) return Response.json({ trips: [TRIP] });
        if (key === `GET ${base}/documents`)
          return Response.json({ requirements: [], travelers: 3, missingRequired: 0 });
        if (key === `GET ${base}/packing`)
          return Response.json({ items, travelers: TRAVELERS, ready: items.length === 1 ? 1 : 0 });
        if (key === `POST ${base}/packing`) {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          const created = {
            ...ITEM,
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            ...body,
            counts: { travelers: 3, packed: 0 },
          };
          items = [...items, created];
          return Response.json(created, { status: 201 });
        }
        if (key === `DELETE ${base}/packing/${ITEM.id}`) {
          items = items.filter((i) => i.id !== ITEM.id);
          return Response.json({ deleted: true, itemId: ITEM.id });
        }
        return Response.json(
          { error: { code: 'NOT_FOUND', message: key, correlationId: 't' } },
          { status: 404 },
        );
      }),
    );
    renderWithQuery(<PreparationPage />);
    await screen.findByText('Live');
    const row = await screen.findByTestId(`packing-${ITEM.id}`);
    expect(row.textContent).toContain('Passport + copy');
    expect(row.textContent).toContain('1 of 3 packed');
    expect(screen.getByTestId('packing-ready').textContent).toBe('1 of 3 travelers fully packed');
    expect(screen.getByTestId('packing-travelers').textContent).toContain(
      'Minji Park · Bus A · 1/1',
    );

    // Add an item with a note: the POST carries both; the row reads 0 of 3.
    const form = screen.getByRole('form', { name: 'Add an item' });
    fireEvent.change(within(form).getByLabelText('Item'), { target: { value: 'EU plug adapter' } });
    fireEvent.change(within(form).getByLabelText('Note'), { target: { value: 'Type C or F' } });
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText('EU plug adapter')).toBeTruthy());
    const post = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url, init]) => init?.method === 'POST' && String(url).endsWith('/packing'),
      );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      name: 'EU plug adapter',
      note: 'Type C or F',
    });
    expect(screen.getByText('Type C or F')).toBeTruthy();

    // Remove the passport item.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Passport + copy' }));
    await waitFor(() => expect(calls).toContain(`DELETE ${base}/packing/${ITEM.id}`));
    await waitFor(() => expect(screen.queryByTestId(`packing-${ITEM.id}`)).toBeNull());
  });
});

describe('Journey graph on the API (slice 050)', () => {
  const base = `/v1/orgs/${ORG.id}/trips/${TRIP.id}`;
  const event = (
    id: string,
    start: string,
    end: string | null,
    title: string,
    kind = 'activity',
    status = 'scheduled',
    date = '2026-12-28',
  ) => ({
    id,
    tripId: TRIP.id,
    date,
    start,
    end,
    timeZone: 'Europe/Rome',
    kind,
    title,
    place: 'Rome',
    pax: null,
    status,
    note: null,
    order: Number(start.replace(':', '')),
    published: true,
  });
  const ITINERARY = {
    tripId: TRIP.id,
    tripName: 'Tour',
    startDate: '2026-12-26',
    endDate: '2026-12-28',
    revision: 1,
    publishedAt: '2026-10-12T00:00:00.000Z',
    view: 'draft',
    days: [
      { date: '2026-12-26', timeZone: 'Europe/Rome', label: 'Day 1' },
      { date: '2026-12-27', timeZone: 'Europe/Rome', label: 'Day 2' },
      { date: '2026-12-28', timeZone: 'Europe/Rome', label: 'Arrival' },
    ],
    events: [
      event('aaaaaaaa-0000-4000-8000-000000000001', '09:00', '10:00', 'Breakfast', 'meal', 'done'),
      event('aaaaaaaa-0000-4000-8000-000000000002', '10:10', null, 'Bus to Colosseum', 'bus'),
      event('aaaaaaaa-0000-4000-8000-000000000003', '12:30', '13:30', 'Lunch', 'meal'),
      event(
        'aaaaaaaa-0000-4000-8000-000000000004',
        '15:00',
        null,
        'Cancelled walk',
        'activity',
        'cancelled',
      ),
      event(
        'aaaaaaaa-0000-4000-8000-000000000005',
        '08:00',
        '08:30',
        'Day 2 coffee',
        'meal',
        'scheduled',
        '2026-12-27',
      ),
    ],
    unpublished: 0,
  };

  it('draws the first day with events, flags the ten-minute gap, switches days, counts proposals', async () => {
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET ${base}/itinerary`]: () => ITINERARY,
      [`PUT ${base}/itinerary/events/aaaaaaaa-0000-4000-8000-000000000001`]: () =>
        ITINERARY.events[0],
      [`PUT ${base}/itinerary/events/aaaaaaaa-0000-4000-8000-000000000002`]: () =>
        ITINERARY.events[1],
      // Slice 055: the AI port's drafts for the slip (the shape the fixture port answers).
      [`POST ${base}/itinerary/disruption-drafts`]: () => ({
        provider: 'fixture',
        drafts: [
          {
            title: 'Shorten Lunch',
            rationale: 'Taking 20 minutes off Lunch lets what follows keep its time.',
            actions: [
              {
                eventId: 'aaaaaaaa-0000-4000-8000-000000000001',
                action: 'move',
                start: '09:20',
                end: '10:20',
              },
              {
                eventId: 'aaaaaaaa-0000-4000-8000-000000000002',
                action: 'move',
                start: '10:20',
                end: null,
              },
              {
                eventId: 'aaaaaaaa-0000-4000-8000-000000000003',
                action: 'shorten',
                start: '12:30',
                end: '13:10',
              },
            ],
          },
        ],
      }),
      [`PUT ${base}/itinerary/events/aaaaaaaa-0000-4000-8000-000000000003`]: () => ({}) as unknown,
      [`GET ${base}/itinerary/proposals`]: () => ({
        proposals: [
          {
            id: 'bbbbbbbb-0000-4000-8000-000000000001',
            tripId: TRIP.id,
            kind: 'remove',
            eventId: 'aaaaaaaa-0000-4000-8000-000000000001',
            eventTitle: 'Breakfast',
            patch: {},
            note: 'Rained out',
            status: 'pending',
            proposedByName: 'Kim Daeun',
            proposedAt: '2026-10-12T01:00:00.000Z',
            decidedAt: null,
            decidedByName: null,
            decisionNote: null,
          },
        ],
      }),
    });
    renderWithQuery(<JourneyGraphPage />);
    await screen.findByText('Live');
    // Today (2026-10-12) is before the trip: the first day with events is Day 2 (2026-12-27).
    await waitFor(() => expect(screen.getAllByTestId(/^node-/)).toHaveLength(1));
    expect(text(screen.getByRole('heading', { level: 1 }).parentElement)).toContain(
      '1 movements on Day 2',
    );
    // Day 3: three nodes, the cancelled walk left out, the bus at risk after a ten-minute gap.
    fireEvent.click(screen.getByRole('button', { name: 'D3' }));
    await waitFor(() => expect(screen.getAllByTestId(/^node-/)).toHaveLength(3));
    expect(
      screen.getByTestId('node-aaaaaaaa-0000-4000-8000-000000000002').getAttribute('data-status'),
    ).toBe('risk');
    expect(
      screen.getByTestId('node-aaaaaaaa-0000-4000-8000-000000000001').getAttribute('data-status'),
    ).toBe('done');
    expect(text(screen.getByRole('heading', { level: 1 }).parentElement)).toContain(
      '3 movements on Arrival · 1 tight connection',
    );
    expect(screen.getByTestId('tight').textContent).toContain(
      '10:00 Breakfast → 10:10 Bus to Colosseum · 10 min',
    );
    expect(screen.getByTestId('pending-proposals').textContent).toContain(
      'Kim Daeun: remove Breakfast',
    );
    expect(screen.getByRole('link', { name: 'Decide on the Itinerary page (1)' })).toBeTruthy();

    // Disruption (slice 051): Breakfast slips 20 minutes; the bus is pushed, lunch keeps its time;
    // applying PUTs the two moved events into the draft.
    fireEvent.change(screen.getByLabelText('Event that slips'), {
      target: { value: 'aaaaaaaa-0000-4000-8000-000000000001' },
    });
    fireEvent.change(screen.getByLabelText('Minutes late'), { target: { value: '20' } });
    const lines = screen.getByTestId('propagation-live').textContent ?? '';
    expect(lines).toContain('Breakfast: 09:00 → 09:20');
    expect(lines).toContain('Bus to Colosseum: 10:10 → 10:20, pushed by the one before');
    expect(lines).toContain('Lunch keeps 12:30: 130 min of slack absorb it');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to the draft' }));
    await waitFor(() =>
      expect(screen.getByTestId('disruption-status').textContent).toContain(
        '2 events moved in the draft',
      ),
    );
    const puts = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === 'PUT')
      .map(([url, init]) => [String(url).split('/').pop(), JSON.parse(String(init?.body))]);
    expect(
      puts.map(([id, body]) => [
        id,
        (body as { start: string }).start,
        (body as { end: string | null }).end,
      ]),
    ).toEqual([
      ['aaaaaaaa-0000-4000-8000-000000000001', '09:20', '10:20'],
      ['aaaaaaaa-0000-4000-8000-000000000002', '10:20', null],
    ]);

    // Drafts (slice 055): the ask lists the draft with its steps; applying it PUTs the moves and
    // the shortened end.
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI for drafts' }));
    const drafts = await screen.findByTestId('drafts-live');
    expect(drafts.textContent).toContain('Shorten Lunch');
    expect(drafts.textContent).toContain('Move Breakfast: 09:00 → 09:20');
    expect(drafts.textContent).toContain('Shorten Lunch: ends 13:10');
    const asked = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === 'POST')
      .map(
        ([, init]) =>
          JSON.parse(String(init?.body)) as { minutes: number; events: unknown[]; locale: string },
      );
    expect(asked[0]?.minutes).toBe(20);
    expect(asked[0]?.events).toHaveLength(3);
    expect(asked[0]?.locale).toBe('en');
    fireEvent.click(screen.getByRole('button', { name: 'Apply this draft' }));
    await waitFor(() =>
      expect(screen.getByTestId('drafts-status').textContent).toContain(
        '3 events changed in the draft',
      ),
    );
    const draftPuts = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === 'PUT')
      .slice(2)
      .map(([url, init]) => {
        const b = JSON.parse(String(init?.body)) as {
          start: string;
          end: string | null;
          status: string;
        };
        return [String(url).split('/').pop(), b.start, b.end, b.status];
      });
    expect(draftPuts).toEqual([
      // Breakfast is done in the fixture; the upsert carries each event's own status.
      ['aaaaaaaa-0000-4000-8000-000000000001', '09:20', '10:20', 'done'],
      ['aaaaaaaa-0000-4000-8000-000000000002', '10:20', null, 'scheduled'],
      ['aaaaaaaa-0000-4000-8000-000000000003', '12:30', '13:10', 'scheduled'],
    ]);
  });

  it('propagate: a slip pushes what follows only as far as the slack runs out', () => {
    const events = ITINERARY.events.map((e) =>
      fromApiEvent(e as unknown as Parameters<typeof fromApiEvent>[0]),
    );
    const breakfast = propagate(events, '2026-12-28', 'aaaaaaaa-0000-4000-8000-000000000001', 20);
    expect(breakfast.map((p) => [p.title, p.newStart, p.newEnd, p.moved, p.slackLeft])).toEqual([
      ['Breakfast', '09:20', '10:20', true, 0],
      ['Bus to Colosseum', '10:20', null, true, 0],
      ['Lunch', '12:30', '13:30', false, 130],
    ]);
    const bus = propagate(events, '2026-12-28', 'aaaaaaaa-0000-4000-8000-000000000002', 200);
    expect(bus.map((p) => [p.title, p.newStart, p.newEnd, p.moved])).toEqual([
      ['Bus to Colosseum', '13:30', null, true],
      ['Lunch', '13:30', '14:30', true],
    ]);
    const lunch = propagate(events, '2026-12-28', 'aaaaaaaa-0000-4000-8000-000000000003', 5);
    expect(lunch).toHaveLength(1);
    expect(propagate(events, '2026-12-28', 'nope', 5)).toEqual([]);
    expect(propagate(events, '2026-12-28', 'aaaaaaaa-0000-4000-8000-000000000001', 0)).toEqual([]);
  });
});
