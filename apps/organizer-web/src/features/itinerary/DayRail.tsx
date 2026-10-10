// Copyright 2026- At Day. All rights reserved.
// Left rail: one button per trip day with weekday, date, label, and event count.

import type { ItineraryDay } from '../../fixtures/itinerary';
import { strings } from '../../lib/strings';

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });
const DAYNUM = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

export function DayRail({
  days,
  counts,
  selected,
  onSelect,
}: {
  days: ItineraryDay[];
  counts: Map<string, number>;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  return (
    <nav className="dayrail card" aria-label={strings.itinerary.days}>
      <ol className="dayrail__list">
        {days.map((d, i) => {
          const dt = new Date(`${d.date}T00:00:00Z`);
          const n = counts.get(d.date) ?? 0;
          const active = d.date === selected;
          return (
            <li key={d.date}>
              <button
                type="button"
                className="dayrail__item"
                aria-current={active ? 'date' : undefined}
                onClick={() => onSelect(d.date)}
              >
                <span className="dayrail__date">
                  <span className="dayrail__wd">{WEEKDAY.format(dt)}</span>
                  <span className="dayrail__num">{DAYNUM.format(dt)}</span>
                  <span className="dayrail__mo">{MONTH.format(dt)}</span>
                </span>
                <span className="dayrail__text">
                  <span className="dayrail__label">
                    Day {i + 1} · {d.label}
                  </span>
                  <span className="dayrail__count">{strings.itinerary.eventsCount(n)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
