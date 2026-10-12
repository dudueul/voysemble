// Copyright 2026- At Day. All rights reserved.
// The driver's bus sheet (D27, D39, slice 049): a public page outside the session gate. The link
// the organizer handed over carries the token in its fragment; the page posts it once per open
// (the organizer sees the count) and shows the trip, the bus and the names riding it, grouped,
// leaders first. Names only: no contact, no room, no guardian. A print button for the clipboard
// on the dashboard. An unknown, expired or revoked link is one honest message. No router hooks:
// the organization id comes from the path, so the page tests without one.

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { driver } from '../../lib/session';
import { strings } from '../../lib/strings';
import { readTokenFromHash } from '../auth/VerifyPage';

const s = strings.driver;

function orgIdFromPath(pathname: string): string {
  const m = /^\/driver\/([0-9a-f-]{36})/i.exec(pathname);
  return m?.[1] ?? '';
}

export function DriverSheetPage() {
  const [token] = useState(() => readTokenFromHash(location.hash));
  const [orgId] = useState(() => orgIdFromPath(location.pathname));
  const sheet = useQuery({
    queryKey: ['driver', orgId, token],
    queryFn: () => driver.open(orgId, token ?? ''),
    enabled: Boolean(token && orgId),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (!token || !orgId) return <Failed body={s.missing} />;
  if (sheet.isPending) {
    return (
      <Frame>
        <div className="state" role="status" aria-busy="true">
          <h1 className="state__title" id="driver-title">
            {s.title}
          </h1>
          <p className="state__body">{s.loading}</p>
        </div>
      </Frame>
    );
  }
  if (sheet.isError) return <Failed body={s.invalid} />;
  const d = sheet.data;
  return (
    <Frame wide>
      <header className="driver-sheet__head">
        <h1 className="state__title" id="driver-title" data-testid="driver-bus">
          {d.bus.label} · {d.bus.company}
        </h1>
        <p className="state__body">
          {d.tripName} · {d.organizationName}
        </p>
        <p className="muted small">
          {d.startsOn} → {d.endsOn} · {s.seats(d.bus.seats)} · {s.counts(d.leaders, d.travelers)}
        </p>
      </header>
      {d.groups.length === 0 ? (
        <p className="muted small">{s.noGroups}</p>
      ) : (
        d.groups.map((g) => (
          <section
            key={g.name}
            className="driver-sheet__group"
            aria-labelledby={`group-${g.name}`}
            data-testid={`driver-group-${g.name}`}
          >
            <h2 className="driver-sheet__name" id={`group-${g.name}`}>
              {g.name}
            </h2>
            {g.leaders.length > 0 ? (
              <>
                <h3 className="field__label">{s.leaders}</h3>
                <ul className="list list--plain">
                  {g.leaders.map((n) => (
                    <li key={n}>
                      <strong>{n}</strong>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <h3 className="field__label">{s.travelers}</h3>
            <ol className="driver-sheet__list">
              {g.travelers.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ol>
          </section>
        ))
      )}
      <p className="muted small">{s.namesOnly}</p>
      <p className="muted small">{s.expires(d.expiresAt.slice(0, 10))}</p>
      <div className="driver-sheet__actions">
        <button type="button" className="btn btn--primary" onClick={() => window.print()}>
          {s.print}
        </button>
      </div>
    </Frame>
  );
}

function Frame({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="auth">
      <section
        className={`auth__card card${wide ? ' driver-sheet' : ''}`}
        aria-labelledby="driver-title"
      >
        <div className="auth__brand">
          <Icons.logo />
          <span>{strings.app.name}</span>
        </div>
        {children}
      </section>
    </main>
  );
}

function Failed({ body }: { body: string }) {
  return (
    <Frame>
      <div role="alert">
        <h1 className="state__title" id="driver-title">
          {s.failedTitle}
        </h1>
        <p className="state__body">{body}</p>
      </div>
    </Frame>
  );
}
