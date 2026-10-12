// Copyright 2026- At Day. All rights reserved.
// Email magic-link request. One field, one button, one honest "check your email" state. The
// server answers the same way for unknown addresses, so this page never says "no account".

import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { ApiError } from '../../lib/api-client';
import { auth } from '../../lib/session';
import { getLocale, strings } from '../../lib/strings';

export function SignInPage() {
  const [email, setEmail] = useState('');
  const request = useMutation({
    mutationFn: (value: string) => auth.requestMagicLink(value, getLocale()),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) request.mutate(email.trim());
  };

  return (
    <main className="auth">
      <section className="auth__card card" aria-labelledby="signin-title">
        <div className="auth__brand">
          <Icons.logo />
          <span>{strings.app.name}</span>
        </div>
        {request.isSuccess ? (
          <div className="state" role="status">
            <h1 className="state__title" id="signin-title">
              {strings.auth.sentTitle}
            </h1>
            <p className="state__body">{strings.auth.sentBody(request.variables ?? email)}</p>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => request.reset()}
            >
              {strings.auth.useAnother}
            </button>
          </div>
        ) : (
          <form className="form" onSubmit={onSubmit}>
            <h1 className="page__title" id="signin-title">
              {strings.auth.title}
            </h1>
            <p className="page__subtitle">{strings.auth.subtitle}</p>
            <label className="field">
              <span className="field__label">{strings.auth.email}</span>
              <input
                className="field__input"
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {request.isError ? (
              <p className="field__error" role="alert">
                {request.error instanceof ApiError
                  ? strings.auth.failed(request.error.correlationId)
                  : strings.auth.failed('none')}
              </p>
            ) : null}
            <div className="form__actions">
              <button type="submit" className="btn btn--primary" disabled={request.isPending}>
                {request.isPending ? strings.auth.sending : strings.auth.send}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
