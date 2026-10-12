// Copyright 2026- At Day. All rights reserved.
// Landing page of an organizer invitation (slice 042, D33). The emailed link carries the token in
// the fragment (never sent to the server by the browser). Signed out: the token waits in local
// storage and the sign-in form shows with a lead; the verify page comes back here. Signed in: the
// token is posted once and the result says which organization the account now organizes, or why
// not (another address, a spent or dead link). No router hooks: plain links, so the page tests
// without one.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { ApiError } from '../../lib/api-client';
import {
  clearInvitationToken,
  readInvitationToken,
  storeInvitationToken,
} from '../../lib/invitation-token';
import { auth, invitations, meQuery, writeActiveOrgId } from '../../lib/session';
import { strings } from '../../lib/strings';
import { SignInPage } from './SignInPage';
import { readTokenFromHash } from './VerifyPage';

const s = strings.invitations;

/** The token from the fragment (stored, and the fragment stripped) or the one stored earlier. */
function takeToken(): string | null {
  const fromHash = readTokenFromHash(location.hash);
  if (fromHash) {
    storeInvitationToken(fromHash);
    history.replaceState(null, '', '/invitations/accept');
    return fromHash;
  }
  return readInvitationToken();
}

export function AcceptInvitationPage() {
  const qc = useQueryClient();
  const [token] = useState(takeToken);
  const me = useQuery(meQuery);
  const started = useRef(false);
  const accept = useMutation({
    mutationFn: (t: string) => invitations.accept(t),
    onSuccess: (r) => {
      clearInvitationToken();
      // The new organization is the one to open; the shell reads the list afresh.
      writeActiveOrgId(r.organizationId);
      void qc.invalidateQueries();
    },
  });
  const signedIn = Boolean(me.data);
  useEffect(() => {
    if (signedIn && token && !started.current) {
      started.current = true;
      accept.mutate(token);
    }
  }, [signedIn, token, accept]);

  if (me.isPending) {
    return <Frame status>{strings.settings.loading}</Frame>;
  }
  if (!me.data) {
    if (!token) return <Failed body={s.missing} />;
    return <SignInPage lead={s.signInFirst} />;
  }
  if (!token) return <Failed body={s.missing} />;
  if (accept.isSuccess) {
    const r = accept.data;
    return (
      <Frame>
        <h1 className="state__title" data-testid="invitation-result">
          {r.alreadyMember
            ? s.alreadyTitle(r.organizationName)
            : s.acceptedTitle(r.organizationName)}
        </h1>
        <p className="state__body">{r.alreadyMember ? s.alreadyBody : s.acceptedBody}</p>
        <a className="btn btn--primary" href="/">
          {s.openConsole}
        </a>
      </Frame>
    );
  }
  if (accept.isError) {
    const e = accept.error;
    const code = e instanceof ApiError ? e.status : 0;
    const signOut = async () => {
      await auth.logout();
      qc.setQueryData(meQuery.queryKey, null);
      started.current = false;
      accept.reset();
    };
    return (
      <Failed
        body={
          code === 404
            ? s.invalid
            : code === 409
              ? s.alreadyAccepted
              : code === 403
                ? s.wrongAddress(me.data.email)
                : s.failed(e instanceof ApiError ? e.correlationId : 'none')
        }
        action={
          code === 403 ? (
            <button type="button" className="btn btn--ghost" onClick={() => void signOut()}>
              {s.useAnother}
            </button>
          ) : (
            <a className="btn btn--primary" href="/">
              {s.openConsole}
            </a>
          )
        }
      />
    );
  }
  return <Frame status>{s.accepting}</Frame>;
}

function Frame({ children, status = false }: { children: React.ReactNode; status?: boolean }) {
  return (
    <main className="auth">
      <section className="auth__card card" aria-labelledby="invitation-title">
        <div className="auth__brand">
          <Icons.logo />
          <span>{strings.app.name}</span>
        </div>
        {status ? (
          <div className="state" role="status" aria-busy="true">
            <h1 className="state__title" id="invitation-title">
              {s.title}
            </h1>
            <p className="state__body">{children}</p>
          </div>
        ) : (
          <div className="state">{children}</div>
        )}
      </section>
    </main>
  );
}

function Failed({ body, action }: { body: string; action?: React.ReactNode }) {
  return (
    <Frame>
      <div role="alert">
        <h1 className="state__title" id="invitation-title">
          {s.failedTitle}
        </h1>
        <p className="state__body">{body}</p>
      </div>
      {action ?? (
        <a className="btn btn--primary" href="/sign-in">
          {strings.auth.backToSignIn}
        </a>
      )}
    </Frame>
  );
}
