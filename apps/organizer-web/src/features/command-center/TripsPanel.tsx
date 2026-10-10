// Copyright 2026- At Day. All rights reserved.
// Trip list with synthetic cover art. Real licensed photography is a later asset slice (doc 01 §15).

import { Icons } from '../../app/shell/icons';
import type { Trip } from '../../fixtures/korea-concert-tour';
import { formatDateRange } from '../../lib/format';
import { strings } from '../../lib/strings';

export function CoverArt({ hue, label }: { hue: number; label: string }) {
  return (
    <div
      className="cover"
      aria-hidden="true"
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 70% 46%), hsl(${(hue + 40) % 360} 75% 62%))`,
      }}
    >
      {label.slice(0, 3).toUpperCase()}
    </div>
  );
}

export function TripsPanel({
  trips,
  activeTripId,
}: {
  trips: Trip[];
  activeTripId: string | null;
}) {
  return (
    <section className="card" aria-labelledby="tr-title">
      <div className="card__head">
        <h2 className="card__title" id="tr-title">
          {strings.dashboard.upcomingTrips}
        </h2>
        <button type="button" className="link">
          <Icons.plus width="16" height="16" />
          New trip
        </button>
      </div>
      <div className="card__body trips">
        {trips.map((t) => (
          <div
            key={t.id}
            className="trip"
            aria-current={t.id === activeTripId ? 'true' : undefined}
          >
            <CoverArt hue={t.coverHue} label={t.destination} />
            <div>
              <div className="trip__name">{t.name}</div>
              <div className="trip__meta">
                {t.destination} · {formatDateRange(t.startDate, t.endDate)} · {t.travelerCount}{' '}
                travelers
              </div>
            </div>
            <span className={`chip chip--${t.status}`}>{strings.tripStatus[t.status]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
