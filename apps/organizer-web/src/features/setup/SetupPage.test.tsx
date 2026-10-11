// Copyright 2026- At Day. All rights reserved.
// Facts: the checklist opens the first undone step from real API shapes; creating an org calls
// POST /v1/orgs and advances; invite CSV export escapes correctly.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invitesToCsv, SetupPage } from './SetupPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
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
  name: 'Korea Concert Tour 2026',
  startsOn: '2026-12-26',
  endsOn: '2027-01-07',
  timezone: 'Asia/Seoul',
  createdAt: '2026-10-11T00:00:00.000Z',
};

/** Routes fetch by path; unknown paths fail loudly. */
function stubApi(routes: Record<string, (init?: RequestInit) => unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`;
    const handler = routes[key];
    if (!handler)
      return Response.json(
        { error: { code: 'NOT_FOUND', message: key, correlationId: 't' } },
        { status: 404 },
      );
    const out = handler(init);
    return Response.json(out, { status: init?.method === 'POST' ? 201 : 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SetupPage />
    </QueryClientProvider>,
  );
}

describe('SetupPage', () => {
  it('no orgs: step 1 open, others locked; creating advances to step 2', async () => {
    let orgs: unknown[] = [];
    const fetchMock = stubApi({
      'GET /v1/orgs': () => ({ organizations: orgs }),
      'POST /v1/orgs': () => {
        orgs = [ORG];
        return ORG;
      },
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [] }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('step-1').dataset.state).toBe('open'));
    expect(screen.getByTestId('step-2').dataset.state).toBe('locked');
    expect(screen.getByTestId('setup-progress').textContent).toBe('0 of 4 done');

    fireEvent.change(screen.getByLabelText('Organization name'), {
      target: { value: 'Seoul Arts High' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));
    await waitFor(() => expect(screen.getByTestId('step-1').dataset.state).toBe('done'));
    await waitFor(() => expect(screen.getByTestId('step-2').dataset.state).toBe('open'));
    expect(screen.getByTestId('setup-progress').textContent).toBe('1 of 4 done');
    const post = fetchMock.mock.calls.find(
      (c) => String(c[0]) === '/v1/orgs' && c[1]?.method === 'POST',
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      name: 'Seoul Arts High',
      defaultLocale: 'ko',
    });
  });

  it('org + trip + roster: step 3 and 4 open, counts shown', async () => {
    stubApi({
      'GET /v1/orgs': () => ({ organizations: [ORG] }),
      [`GET /v1/orgs/${ORG.id}/trips`]: () => ({ trips: [TRIP] }),
      [`GET /v1/orgs/${ORG.id}/trips/${TRIP.id}/roster`]: () => ({
        participations: [
          {
            id: 'p1',
            tripId: TRIP.id,
            role: 'traveler',
            displayName: 'Minji',
            groupName: 'Bus A',
            guardianOf: null,
            accountId: null,
            createdAt: TRIP.createdAt,
          },
          {
            id: 'p2',
            tripId: TRIP.id,
            role: 'guardian',
            displayName: 'Sora',
            groupName: 'Bus A',
            guardianOf: 'p1',
            accountId: 'acc',
            createdAt: TRIP.createdAt,
          },
        ],
      }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('step-3').dataset.state).toBe('done'));
    expect(screen.getByTestId('step-4').dataset.state).toBe('done');
    expect(screen.getByTestId('count-traveler').textContent).toBe('1');
    expect(screen.getByTestId('count-guardian').textContent).toBe('1');
    expect(screen.getByTestId('setup-progress').textContent).toBe('4 of 4 done');
    expect(screen.getByText('1 of 2 joined')).toBeTruthy();
  });
});

describe('invitesToCsv', () => {
  it('escapes names with commas and quotes', () => {
    const csv = invitesToCsv([
      {
        participationId: 'p',
        role: 'traveler',
        displayName: 'Lee, "Hana"',
        code: 'ABCD-EFGH',
        expiresAt: '2026-11-10T00:00:00.000Z',
      },
    ]);
    expect(csv).toBe(
      'name,role,code,expires_at\n"Lee, ""Hana""",traveler,ABCD-EFGH,2026-11-10T00:00:00.000Z',
    );
  });
});
