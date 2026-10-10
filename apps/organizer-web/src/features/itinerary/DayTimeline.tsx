// Copyright 2026- At Day. All rights reserved.
// Center column: ordered events for the selected day. Reorder via keyboard-accessible buttons
// (drag is a later enhancement, never the only way). Draft rows carry a textual badge.

import { Icons } from '../../app/shell/icons';
import type { ItineraryDay, ItineraryEvent } from '../../fixtures/itinerary';
import { formatDayLabel } from '../../lib/format';
import { strings } from '../../lib/strings';
import type { EditorAction } from './itinerary-model';

const ICON: Record<ItineraryEvent['kind'], keyof typeof Icons> = {
  flight: 'plane',
  bus: 'bus',
  meal: 'meal',
  activity: 'flag',
  hotel: 'hotel',
  meeting: 'pin',
  free: 'today',
};

const STATUS_CHIP: Record<ItineraryEvent['status'], string> = {
  scheduled: 'chip--scheduled',
  delayed: 'chip--delayed',
  done: 'chip--done',
  in_progress: 'chip--now',
  cancelled: 'chip--completed',
};

export function DayTimeline({
  day,
  events,
  selectedId,
  dispatch,
}: {
  day: ItineraryDay | null;
  events: ItineraryEvent[];
  selectedId: string | null;
  dispatch: (a: EditorAction) => void;
}) {
  if (!day) return null;
  return (
    <section className="card timeline" aria-labelledby="tl-title">
      <div className="card__head">
        <div>
          <h2 className="card__title" id="tl-title">
            {formatDayLabel(`${day.date}T12:00:00Z`, 'UTC')}
          </h2>
          <p className="page__subtitle">
            {day.label} · {day.timeZone.replace('_', ' ')}
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => dispatch({ type: 'add', date: day.date })}
        >
          <Icons.plus width="16" height="16" />
          {strings.itinerary.addEvent}
        </button>
      </div>
      <div className="card__body">
        {events.length === 0 ? (
          <p className="state__body">{strings.itinerary.noEvents}</p>
        ) : (
          <ol className="timeline__list">
            {events.map((e, i) => {
              const Icon = Icons[ICON[e.kind]];
              const selected = e.id === selectedId;
              return (
                <li
                  key={e.id}
                  className={`tlrow ${selected ? 'tlrow--selected' : ''}`}
                  aria-current={selected ? 'true' : undefined}
                >
                  <button
                    type="button"
                    className="tlrow__main"
                    onClick={() => dispatch({ type: 'select-event', id: e.id })}
                    aria-label={`${e.start} ${e.title}`}
                  >
                    <span className="movement__time">
                      {e.start}
                      {e.end ? <small>– {e.end}</small> : <small>&nbsp;</small>}
                    </span>
                    <span className="movement__icon">
                      <Icon />
                    </span>
                    <span className="tlrow__text">
                      <span className="movement__title">
                        {e.title}
                        {!e.published ? (
                          <span className="chip chip--sample tlrow__draft">
                            {strings.itinerary.draft}
                          </span>
                        ) : null}
                      </span>
                      <span className="movement__place">{e.place || '—'}</span>
                      {e.note ? <span className="movement__note">{e.note}</span> : null}
                    </span>
                    <span className="movement__right">
                      <span>{e.pax === 'all' ? strings.itinerary.paxAll : `${e.pax} pax`}</span>
                      <span className={`chip ${STATUS_CHIP[e.status]}`}>
                        {strings.status[e.status]}
                      </span>
                    </span>
                  </button>
                  <span className="tlrow__tools">
                    <button
                      type="button"
                      className="iconbtn iconbtn--sm"
                      aria-label={`${strings.itinerary.moveUp}: ${e.title}`}
                      disabled={i === 0}
                      onClick={() => dispatch({ type: 'move', id: e.id, direction: 'up' })}
                    >
                      <Icons.arrow style={{ transform: 'rotate(-90deg)' }} width="16" height="16" />
                    </button>
                    <button
                      type="button"
                      className="iconbtn iconbtn--sm"
                      aria-label={`${strings.itinerary.moveDown}: ${e.title}`}
                      disabled={i === events.length - 1}
                      onClick={() => dispatch({ type: 'move', id: e.id, direction: 'down' })}
                    >
                      <Icons.arrow style={{ transform: 'rotate(90deg)' }} width="16" height="16" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
