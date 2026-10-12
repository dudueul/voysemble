// Copyright 2026- At Day. All rights reserved.
// Landing page of the step-up confirmation link (D35, slice 045). Reads the token from the
// fragment, posts it with the session that asked, and returns to the page that needed it (kept
// in localStorage by that page). Signed out, the session that asked is gone: the link cannot
// confirm anything, and the page says so. No router hooks: plain links, so the page tests alone.

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { ApiError } from '../../lib/api-client';
import { takeReauthNext } from '../../lib/reauth';
import { auth, meQuery } from '../../lib/session';
import { strings } from '../../lib/strings';
import { readTokenFromHash } from './VerifyPage';

const s = strings.reauth;

export function ReauthPage() {
  const [token] = useState(() => {
    const t = readTokenFromHash(location.hash);
    if (t) history.replaceState(null, '', '/auth/reauth');
    return t;
  });
  const me = useQuery(meQuery);
  const started = useRef(false);
  const [next, setNext] = useState<string | null>(null);
  const verify = useMutation({
    mutationFn: (t: string) => auth.reauthVerify(t),
    onSuccess: () => {
      const path = takeReauthNext();
      setNext(path);
      // A plain navigation: the page that asked re-runs its query with the fresh confirmation.
      location.assign(path);
    },
  });
  const signedIn = Boolean(me.data);
  useEffect(() => {
    if (signedIn && token && !started.current) {
      started.current = true;
      verify.mutate(token);
    }
  }, [signedIn, token, verify]);

  let body: React.ReactNode;
  if (me.isPending) {
    body = <Status text={strings.settings.loading} />;
  } else if (!me.data) {
    body = (
      <Failed
        body={s.signedOut}
        action={
          <a className="btn btn--primary" href="/sign-in">
            {strings.auth.backToSignIn}
          </a>
        }
      />
    );
  } else if (!token) {
    body = <Failed body={s.missing} />;
  } else if (verify.isError) {
    body = (
      <Failed
        body={
          verify.error instanceof ApiError && verify.error.status === 404
            ? s.dead
            : s.failed(verify.error instanceof ApiError ? verify.error.correlationId : 'none')
        }
      />
    );
  } else if (verify.isSuccess) {
    body = (
      <div className="state" role="status" data-testid="reauth-done">
        <h1 className="state__title" id="reauth-title">
          {s.doneTitle}
        </h1>
        <p className="state__body">{s.doneBody}</p>
        <a className="btn btn--primary" href={next ?? '/preparation'}>
          {s.continue}
        </a>
      </div>
    );
  } else {
    body = <Status text={s.confirming} />;
  }
  return (
    <main className="auth">
      <section className="auth__card card" aria-labelledby="reauth-title">
        <div className="auth__brand">
          <Icons.logo />
          <span>{strings.app.name}</span>
        </div>
        {body}
      </section>
    </main>
  );
}

function Status({ text }: { text: string }) {
  return (
    <div className="state" role="status" aria-busy="true">
      <h1 className="state__title" id="reauth-title">
        {s.title}
      </h1>
      <p className="state__body">{text}</p>
    </div>
  );
}

function Failed({ body, action }: { body: string; action?: React.ReactNode }) {
  return (
    <div className="state">
      <div role="alert">
        <h1 className="state__title" id="reauth-title">
          {s.failedTitle}
        </h1>
        <p className="state__body">{body}</p>
      </div>
      {action ?? (
        <a className="btn btn--primary" href="/preparation">
          {s.continue}
        </a>
      )}
    </div>
  );
}
