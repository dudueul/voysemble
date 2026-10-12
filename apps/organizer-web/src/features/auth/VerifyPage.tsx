// Copyright 2026- At Day. All rights reserved.
// Landing page of the emailed link. Reads the token from the URL fragment (never sent to the
// server by the browser), exchanges it for a cookie session, then continues to the app.

import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { ApiError } from '../../lib/api-client';
import { readInvitationToken } from '../../lib/invitation-token';
import { queryClient } from '../../lib/query-client';
import { auth, meQuery } from '../../lib/session';
import { strings } from '../../lib/strings';

export function readTokenFromHash(hash: string): string | null {
  const m = /(?:^#|&)token=([A-Za-z0-9_-]{32,128})(?:&|$)/.exec(hash);
  return m?.[1] ?? null;
}

export function VerifyPage() {
  const navigate = useNavigate();
  const started = useRef(false);
  const verify = useMutation({
    mutationFn: (token: string) => auth.verify(token),
    onSuccess: async () => {
      // Strip the token from the address bar before anything else renders.
      history.replaceState(null, '', '/auth/verify');
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
      // An invitee who signed in to accept an organizer invitation (slice 042) goes back to it.
      if (readInvitationToken()) {
        await navigate({ to: '/invitations/accept', replace: true });
      } else {
        await navigate({ to: '/setup', replace: true });
      }
    },
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = readTokenFromHash(location.hash);
    if (token) verify.mutate(token);
  }, [verify]);

  const token = readTokenFromHash(location.hash);
  const failed = verify.isError || (!token && !verify.isPending && !verify.isSuccess);

  return (
    <main className="auth">
      <section className="auth__card card">
        {failed ? (
          <div className="state" role="alert">
            <h1 className="state__title">{strings.auth.verifyFailedTitle}</h1>
            <p className="state__body">
              {verify.error instanceof ApiError
                ? strings.auth.verifyFailedBody(verify.error.correlationId)
                : strings.auth.verifyMissing}
            </p>
            <a className="btn btn--primary" href="/sign-in">
              {strings.auth.backToSignIn}
            </a>
          </div>
        ) : (
          <div className="state" role="status" aria-busy="true">
            <h1 className="state__title">{strings.auth.verifying}</h1>
          </div>
        )}
      </section>
    </main>
  );
}
