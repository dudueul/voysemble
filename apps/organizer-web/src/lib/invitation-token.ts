// Copyright 2026- At Day. All rights reserved.
// The organizer invitation token between pages (slice 042). The emailed link lands on
// /invitations/accept with the token in the fragment; a signed-out invitee must first sign in
// through the magic link, which opens in a new page, so the token waits in localStorage (shared
// by the tabs of this origin) until the account is in. Cleared on accept; it is one-time and
// seven days on the server anyway. Storage may be blocked (private mode): every call tolerates it.

const KEY = 'voysemble.invitation';

export function storeInvitationToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* blocked storage: the invitee reopens the link after signing in */
  }
}

export function readInvitationToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearInvitationToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
