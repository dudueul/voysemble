// Copyright 2026- At Day. All rights reserved.
// The hotel's sheet (D27, D41, slice 058): a public page outside the session gate, the sibling of
// the driver's. The link the organizer handed over carries the token in its fragment; the page
// posts it once per open (the organizer sees the count) and shows the stay, the rooms with the
// names in them, who has no room yet and the group leaders by name. Names and rooms only: no
// contact, no guardian, no care note, no document. A print button for the desk. An unknown,
// expired or revoked link is one honest message. No router hooks: the organization id comes
// from the path, so the page tests without one.

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { hotel } from '../../lib/session';
import { strings } from '../../lib/strings';
import { readTokenFromHash } from '../auth/VerifyPage';

const s = strings.hotel;

function orgIdFromPath(pathname: string): string {
  const m = /^\/hotel\/([0-9a-f-]{36})/i.exec(pathname);
  return m?.[1] ?? '';
}

export function HotelSheetPage() {
  const [token] = useState(() => readTokenFromHash(location.hash));
  const [orgId] = useState(() => orgIdFromPath(location.pathname));
  const sheet = useQuery({
    queryKey: ['hotel', orgId, token],
    queryFn: () => hotel.open(orgId, token ?? ''),
    enabled: Boolean(token && orgId),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (!token || !orgId) return <Failed body={s.missing} />;
  if (sheet.isPending) {
    return (
      <Frame>
        <div className="state" role="status" aria-busy="true">
          <h1 className="state__title" id="hotel-title">
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
        <h1 className="state__title" id="hotel-title" data-testid="hotel-name">
          {d.hotel.name} · {d.hotel.city}
        </h1>
        <p className="state__body">
          {d.tripName} · {d.organizationName}
        </p>
        <p className="muted small">
          {d.hotel.checkIn} → {d.hotel.checkOut} · {s.stay(d.hotel.nights, d.hotel.rooms)}
          {d.hotel.confirmation ? ` · ${s.confirmation(d.hotel.confirmation)}` : ''}
        </p>
        <p className="muted small">
          {s.rooms(d.rooms.length)} · {s.people(d.people)}
        </p>
      </header>
      <section className="driver-sheet__group" aria-label={s.title} data-testid="hotel-rooms">
        {d.rooms.map((r) => (
          <div key={r.room} data-testid={`hotel-room-${r.room}`}>
            <h2 className="driver-sheet__name">{s.room(r.room)}</h2>
            <ul className="list list--plain">
              {r.names.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      {d.unassigned.length > 0 ? (
        <section className="driver-sheet__group" data-testid="hotel-unassigned">
          <h2 className="driver-sheet__name">{s.unassigned}</h2>
          <ol className="driver-sheet__list">
            {d.unassigned.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ol>
        </section>
      ) : null}
      {d.leaders.length > 0 ? (
        <section className="driver-sheet__group" data-testid="hotel-leaders">
          <h3 className="field__label">{s.leaders}</h3>
          <ul className="list list--plain">
            {d.leaders.map((n) => (
              <li key={n}>
                <strong>{n}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
        aria-labelledby="hotel-title"
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
        <h1 className="state__title" id="hotel-title">
          {s.failedTitle}
        </h1>
        <p className="state__body">{body}</p>
      </div>
    </Frame>
  );
}
