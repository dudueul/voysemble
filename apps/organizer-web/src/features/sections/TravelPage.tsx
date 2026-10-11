// Copyright 2026- At Day. All rights reserved.
// Travel: flights, hotels, bus charters (gallery #8 cards). Booking references are sample
// strings; no provider integration exists yet.

import { Icons } from '../../app/shell/icons';
import { buses, flights, hotels } from '../../fixtures/sections';
import { strings } from '../../lib/strings';
import { Card, Meter, SectionPage } from './SectionPage';

const s = strings.travel;

function hhmm(iso: string): string {
  return iso.slice(11, 16);
}

export function TravelPage() {
  return (
    <SectionPage title={strings.nav.travel} subtitle={s.subtitle}>
      <Card title={s.flights} id="travel-flights">
        <ul className="list" data-testid="flight-list">
          {flights.map((f) => (
            <li key={f.id} className="flight">
              <span className="flight__icon" aria-hidden="true">
                <Icons.plane />
              </span>
              <div className="flight__route">
                <strong>
                  {f.from} → {f.to}
                </strong>
                <span className="muted small">
                  {f.code} · {s.pnr} {f.pnr}
                </span>
              </div>
              <div className="flight__times">
                <span>
                  {hhmm(f.departs)} → {hhmm(f.arrives)}
                </span>
                <span className="muted small">{f.departs.slice(0, 10)}</span>
              </div>
              <span className="muted small">{s.pax(f.pax)}</span>
              <span className={`chip chip--${f.status}`}>{strings.status[f.status]}</span>
            </li>
          ))}
        </ul>
      </Card>
      <div className="grid">
        <Card title={s.hotels} id="travel-hotels">
          <ul className="list" data-testid="hotel-list">
            {hotels.map((h) => (
              <li key={h.id} className="hotel">
                <span className="flight__icon" aria-hidden="true">
                  <Icons.hotel />
                </span>
                <div className="flight__route">
                  <strong>{h.name}</strong>
                  <span className="muted small">
                    {h.city} · {h.checkIn} → {h.checkOut} · {s.nights(h.nights)}
                  </span>
                </div>
                <span className="muted small">
                  {s.rooms(h.rooms)} · {h.confirmation}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={s.buses} id="travel-buses">
          <ul className="list" data-testid="bus-list">
            {buses.map((b) => (
              <li key={b.id} className="busrow">
                <div className="flight__route">
                  <strong>{b.label}</strong>
                  <span className="muted small">
                    {b.company} · {s.driver}: {b.driverContact}
                  </span>
                </div>
                <Meter value={b.assigned} max={b.seats} label={s.seats(b.assigned, b.seats)} />
                <span className="small">{s.seats(b.assigned, b.seats)}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">{s.driverRule}</p>
        </Card>
      </div>
    </SectionPage>
  );
}
