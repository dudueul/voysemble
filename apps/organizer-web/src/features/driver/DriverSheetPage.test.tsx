// Copyright 2026- At Day. All rights reserved.
// Facts (D39, slice 049): the sheet page posts the token from the fragment once and shows the
// bus, the trip and the names by group, leaders first, with the names-only line; a dead link is
// one honest message; a link without a token says it is incomplete.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DriverSheetPage } from './DriverSheetPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
});

const ORG = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'a'.repeat(43);
const SHEET = {
  organizationName: 'Seoul Arts High',
  tripName: 'Korea Concert Tour 2026',
  startsOn: '2026-12-26',
  endsOn: '2027-01-07',
  bus: { label: 'Bus A', company: 'Roma Coach', seats: 24 },
  groups: [{ name: 'Bus A', leaders: ['Kim'], travelers: ['Juho Kim', 'Minji Park'] }],
  leaders: 1,
  travelers: 2,
  expiresAt: '2026-11-11T10:00:00.000Z',
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DriverSheetPage />
    </QueryClientProvider>,
  );
}

describe('the driver sheet page', () => {
  it('posts the token once and shows the names by group', async () => {
    history.replaceState(null, '', `/driver/${ORG}#token=${TOKEN}`);
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), body: String(init?.body) });
        return Response.json(SHEET);
      }),
    );
    renderPage();
    expect((await screen.findByTestId('driver-bus')).textContent).toBe('Bus A · Roma Coach');
    expect(screen.getByText('Korea Concert Tour 2026 · Seoul Arts High')).toBeTruthy();
    const group = screen.getByTestId('driver-group-Bus A');
    expect(group.textContent).toContain('Kim');
    expect(group.textContent).toContain('Juho Kim');
    expect(group.textContent).toContain('Minji Park');
    expect(
      screen.getByText('Names only. For anything else, ask the leader on the bus.'),
    ).toBeTruthy();
    expect(screen.getByText('This link works until 2026-11-11.')).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`/v1/driver/${ORG}`);
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ token: TOKEN });
  });

  it('says so when the link is dead or incomplete', async () => {
    history.replaceState(null, '', `/driver/${ORG}#token=${TOKEN}`);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code: 'NOT_FOUND', message: 'nope', correlationId: 'c' } },
          { status: 404 },
        ),
      ),
    );
    renderPage();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'This link no longer works. Ask the organizer for a new one.',
    );
    cleanup();
    history.replaceState(null, '', `/driver/${ORG}`);
    renderPage();
    expect(screen.getByRole('alert').textContent).toContain('The link is incomplete.');
  });
});
