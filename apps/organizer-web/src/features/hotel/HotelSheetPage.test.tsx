// Copyright 2026- At Day. All rights reserved.
// Facts (D41, slice 058): the hotel sheet page posts the token from the fragment once and shows
// the stay, the rooms with their names, the unassigned and the leaders; a dead link is one honest
// message; a link without a token says it is incomplete.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HotelSheetPage } from './HotelSheetPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
});

const ORG = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'b'.repeat(43);
const SHEET = {
  organizationName: 'Seoul Arts High',
  tripName: 'Korea Concert Tour 2026',
  hotel: {
    name: 'Hotel de la Ville',
    city: 'Rome',
    checkIn: '2026-12-28',
    checkOut: '2027-01-02',
    nights: 5,
    rooms: 21,
    confirmation: 'HDLV-2026-1228',
  },
  rooms: [
    { room: '204', names: ['Juho Kim', 'Minji Park'] },
    { room: '301', names: ['Kim'] },
  ],
  unassigned: ['Lee, Hana'],
  leaders: ['Kim'],
  people: 4,
  expiresAt: '2026-11-11T10:00:00.000Z',
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <HotelSheetPage />
    </QueryClientProvider>,
  );
}

describe('the hotel sheet page', () => {
  it('posts the token once and lists the rooms, the unassigned and the leaders', async () => {
    history.replaceState(null, '', `/hotel/${ORG}#token=${TOKEN}`);
    const posts: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        posts.push(`${init?.method} ${String(input)} ${String(init?.body)}`);
        return Response.json(SHEET);
      }),
    );
    renderPage();
    expect((await screen.findByTestId('hotel-name')).textContent).toBe('Hotel de la Ville · Rome');
    expect(
      screen.getByText(
        '2026-12-28 → 2027-01-02 · 5 nights · 21 rooms booked · Confirmation HDLV-2026-1228',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('hotel-room-204').textContent).toContain('Room 204');
    expect(screen.getByTestId('hotel-room-204').textContent).toContain('Minji Park');
    expect(screen.getByTestId('hotel-unassigned').textContent).toContain('Lee, Hana');
    expect(screen.getByTestId('hotel-leaders').textContent).toContain('Kim');
    expect(screen.getByText('2 rooms assigned · 4 guests')).toBeTruthy();
    expect(posts).toEqual([`POST /v1/hotel/${ORG} {"token":"${TOKEN}"}`]);
  });

  it('says so for a dead link and for one without a token', async () => {
    history.replaceState(null, '', `/hotel/${ORG}#token=${TOKEN}`);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            error: { code: 'NOT_FOUND', message: 'This link no longer works.', correlationId: 'c' },
          },
          { status: 404 },
        ),
      ),
    );
    renderPage();
    expect((await screen.findByRole('alert')).textContent).toContain('This link no longer works');
    cleanup();
    history.replaceState(null, '', `/hotel/${ORG}`);
    renderPage();
    expect(screen.getByRole('alert').textContent).toContain('The link is incomplete');
  });
});
