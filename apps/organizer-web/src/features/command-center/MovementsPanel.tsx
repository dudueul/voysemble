// Copyright 2026- At Day. All rights reserved.
// Next-48h movements, time-sorted, grouped by local day (doc 00 §10 "Now board").

import type { ReactElement } from 'react';
import { Icons } from '../../app/shell/icons';
import type { Movement } from '../../fixtures/korea-concert-tour';
import { formatDayLabel, formatTime, minutesBetween } from '../../lib/format';
import { strings } from '../../lib/strings';

const ICON: Record<Movement['kind'], (p: object) => ReactElement> = {
  flight: Icons.plane,
  bus: Icons.bus,
  meal: Icons.meal,
  activity: Icons.flag,
  hotel: Icons.hotel,
  meeting: Icons.pin,
};

const STATUS_CHIP: Record<Movement['status'], string> = {
  scheduled: 'chip--scheduled',
  delayed: 'chip--delayed',
  done: 'chip--done',
  in_progress: 'chip--now',
};

export function MovementsPanel({ movements, now }: { movements: Movement[]; now: string }) {
  const horizon = 48 * 60;
  const upcoming = movements
    .filter((m) => {
      const dt = minutesBetween(now, m.at);
      return dt >= -90 && dt <= horizon;
    })
    .sort((a, b) => a.at.localeCompare(b.at));

  const groups = new Map<string, Movement[]>();
  for (const m of upcoming) {
    const day = formatDayLabel(m.at, m.timeZone);
    groups.set(day, [...(groups.get(day) ?? []), m]);
  }

  return (
    <section className="card" aria-labelledby="mv-title">
      <div className="card__head">
        <h2 className="card__title" id="mv-title">
          {strings.dashboard.next48h}
        </h2>
        <button type="button" className="link">
          {strings.nav.itinerary}
          <Icons.arrow width="16" height="16" />
        </button>
      </div>
      <div className="card__body">
        {groups.size === 0 ? <p className="state__body">{strings.dashboard.noMovements}</p> : null}
        {[...groups.entries()].map(([day, items]) => (
          <div key={day}>
            <div className="dayhead">{day}</div>
            {items.map((m) => {
              const Icon = ICON[m.kind];
              return (
                <div key={m.id} className="movement">
                  <div className="movement__time">
                    {formatTime(m.at, m.timeZone)}
                    <small>{m.timeZone.split('/')[1]?.replace('_', ' ')}</small>
                  </div>
                  <span className="movement__icon">
                    <Icon />
                  </span>
                  <div>
                    <div className="movement__title">{m.title}</div>
                    <div className="movement__place">{m.place}</div>
                    {m.note ? <div className="movement__note">{m.note}</div> : null}
                  </div>
                  <div className="movement__right">
                    <span>{m.pax} pax</span>
                    <span className={`chip ${STATUS_CHIP[m.status]}`}>
                      {strings.status[m.status]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
