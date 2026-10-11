// Copyright 2026- At Day. All rights reserved.
// Facts: sign-in posts the address and shows the sent state without claiming an account
// exists; a failure shows the correlation reference; the verify page extracts tokens only from
// the fragment in the documented shape.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignInPage } from './SignInPage';
import { readTokenFromHash } from './VerifyPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('SignInPage', () => {
  it('posts the email and shows the sent state', async () => {
    const fetchMock = vi.fn<FetchFn>(async () =>
      Response.json({ accepted: true, expiresInSeconds: 900 }, { status: 202 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<SignInPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nate@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a link' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Check your email'),
    );
    expect(screen.getByRole('status').textContent).toContain('nate@example.com');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/v1/auth/magic-link');
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'nate@example.com',
      locale: 'en',
    });
  });

  it('shows the correlation reference on failure', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json(
        { error: { code: 'INTERNAL', message: 'x', correlationId: 'corr-9' } },
        { status: 500 },
      ),
    );
    renderWithQuery(<SignInPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a link' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('corr-9'));
  });
});

describe('readTokenFromHash', () => {
  it('accepts only the documented fragment shape', () => {
    const t = 'a'.repeat(43);
    expect(readTokenFromHash(`#token=${t}`)).toBe(t);
    expect(readTokenFromHash(`#x=1&token=${t}`)).toBe(t);
    expect(readTokenFromHash('#token=short')).toBeNull();
    expect(readTokenFromHash('')).toBeNull();
    expect(readTokenFromHash(`?token=${t}`)).toBeNull();
  });
});
