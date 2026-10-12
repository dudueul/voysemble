// Copyright 2026- At Day. All rights reserved.
// Facts: sign-in posts the address and shows the sent state without claiming an account
// exists; a failure shows the correlation reference; the verify page extracts tokens only from
// the fragment in the documented shape. Slice 042: the invitation page keeps the token for a
// signed-out invitee and shows the sign-in form with a lead; signed in, it posts the token once,
// names the organization and clears the token; another address is told so and can sign out.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcceptInvitationPage } from './AcceptInvitationPage';
import { ReauthPage } from './ReauthPage';
import { SignInPage } from './SignInPage';
import { readTokenFromHash } from './VerifyPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  history.replaceState(null, '', '/');
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

describe('AcceptInvitationPage (slice 042)', () => {
  const TOKEN = 'b'.repeat(43);
  const ME = {
    accountId: '44444444-4444-4444-8444-444444444444',
    email: 'kim@example.com',
    locale: 'en',
    displayName: null,
    memberships: [],
  };
  const ORG_ID = '11111111-1111-4111-8111-111111111111';

  function stub(routes: Record<string, () => Response>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${init?.method ?? 'GET'} ${String(input)}`;
        const h = routes[key];
        if (!h) throw new Error(`unexpected call ${key}`);
        return h();
      }),
    );
  }
  const unauthenticated = () =>
    Response.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in required.', correlationId: 'c1' } },
      { status: 401 },
    );

  it('signed out: keeps the token, strips the fragment and shows the sign-in form with a lead', async () => {
    stub({ 'GET /v1/me': unauthenticated });
    history.replaceState(null, '', `/invitations/accept#token=${TOKEN}`);
    renderWithQuery(<AcceptInvitationPage />);
    await screen.findByTestId('signin-lead');
    expect(screen.getByTestId('signin-lead').textContent).toContain('Sign in with the address');
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(localStorage.getItem('voysemble.invitation')).toBe(TOKEN);
    expect(location.hash).toBe('');
  });

  it('signed in: posts the stored token once, names the organization, clears the token', async () => {
    localStorage.setItem('voysemble.invitation', TOKEN);
    stub({
      'GET /v1/me': () => Response.json(ME),
      'POST /v1/invitations/accept': () =>
        Response.json({
          organizationId: ORG_ID,
          organizationName: 'Seoul Arts High',
          role: 'organizer',
          alreadyMember: false,
        }),
    });
    renderWithQuery(<AcceptInvitationPage />);
    await screen.findByTestId('invitation-result');
    expect(screen.getByTestId('invitation-result').textContent).toBe(
      'You now organize Seoul Arts High',
    );
    expect(screen.getByRole('link', { name: 'Open the console' }).getAttribute('href')).toBe('/');
    const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0]?.[1]?.body))).toEqual({ token: TOKEN });
    expect(localStorage.getItem('voysemble.invitation')).toBeNull();
    expect(localStorage.getItem('vy.activeOrgId')).toBe(ORG_ID);
  });

  it('another address: says who is signed in and offers to sign out; then the form shows', async () => {
    localStorage.setItem('voysemble.invitation', TOKEN);
    let signedIn = true;
    stub({
      'GET /v1/me': () => (signedIn ? Response.json(ME) : unauthenticated()),
      'POST /v1/invitations/accept': () =>
        Response.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'This invitation was sent to another address.',
              correlationId: 'c2',
            },
          },
          { status: 403 },
        ),
      'POST /v1/auth/logout': () => {
        signedIn = false;
        return Response.json({ loggedOut: true });
      },
    });
    renderWithQuery(<AcceptInvitationPage />);
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain(
      'sent to another address. You are signed in as kim@example.com.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign out and use another address' }));
    await screen.findByTestId('signin-lead');
    // The token stays for the next account.
    expect(localStorage.getItem('voysemble.invitation')).toBe(TOKEN);
  });

  it('a dead link says so', async () => {
    localStorage.setItem('voysemble.invitation', TOKEN);
    stub({
      'GET /v1/me': () => Response.json(ME),
      'POST /v1/invitations/accept': () =>
        Response.json(
          { error: { code: 'NOT_FOUND', message: 'gone', correlationId: 'c3' } },
          { status: 404 },
        ),
    });
    renderWithQuery(<AcceptInvitationPage />);
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('revoked, expired after 7 days');
  });

  it('without a token: the link is incomplete', async () => {
    stub({ 'GET /v1/me': () => Response.json(ME) });
    renderWithQuery(<AcceptInvitationPage />);
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('The link is incomplete');
  });
});

describe('ReauthPage (slice 045)', () => {
  const TOKEN = 'r'.repeat(43);
  const ME = {
    accountId: '4',
    email: 'nate@example.com',
    locale: 'en',
    displayName: null,
    memberships: [],
  };

  it('signed in: posts the token once, clears the stored return path and goes there', async () => {
    localStorage.setItem('voysemble.reauth.next', '/preparation');
    const assign = vi.fn();
    vi.stubGlobal('location', { ...location, hash: `#token=${TOKEN}`, assign });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${init?.method ?? 'GET'} ${String(input)}`;
        if (key === 'GET /v1/me') return Response.json(ME);
        if (key === 'POST /v1/auth/reauth/verify') {
          return Response.json({
            reauthedAt: '2026-10-12T14:00:00.000Z',
            validUntil: '2026-10-12T14:10:00.000Z',
          });
        }
        throw new Error(`unexpected ${key}`);
      }),
    );
    renderWithQuery(<ReauthPage />);
    await screen.findByTestId('reauth-done');
    const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0]?.[1]?.body))).toEqual({ token: TOKEN });
    expect(assign).toHaveBeenCalledWith('/preparation');
    expect(localStorage.getItem('voysemble.reauth.next')).toBeNull();
  });

  it('a dead link and a signed-out visitor are told what to do', async () => {
    vi.stubGlobal('location', { ...location, hash: `#token=${TOKEN}`, assign: vi.fn() });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = `${init?.method ?? 'GET'} ${String(input)}`;
        if (key === 'GET /v1/me') return Response.json(ME);
        return Response.json(
          { error: { code: 'NOT_FOUND', message: 'dead', correlationId: 'c' } },
          { status: 404 },
        );
      }),
    );
    renderWithQuery(<ReauthPage />);
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('used already or expired');
    cleanup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code: 'UNAUTHENTICATED', message: 'x', correlationId: 'c' } },
          { status: 401 },
        ),
      ),
    );
    renderWithQuery(<ReauthPage />);
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('signed out');
  });
});
