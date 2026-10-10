// Copyright 2026- At Day. All rights reserved.
// Right panel: edit form for the selected event. Each change dispatches immediately (local draft);
// nothing leaves the browser until Publish, and that is a later slice.

import { Icons } from '../../app/shell/icons';
import type { ItineraryEvent } from '../../fixtures/itinerary';
import { strings } from '../../lib/strings';
import { type EditorAction, type EventPatch, KINDS, STATUSES } from './itinerary-model';

export function EventDetail({
  event,
  dispatch,
}: {
  event: ItineraryEvent | null;
  dispatch: (a: EditorAction) => void;
}) {
  if (!event) {
    return (
      <aside className="card detail" aria-label={strings.itinerary.detailTitle}>
        <div className="state" role="status">
          <span className="state__icon">
            <Icons.itinerary />
          </span>
          <p className="state__body">{strings.itinerary.selectPrompt}</p>
        </div>
      </aside>
    );
  }
  const f = strings.itinerary.fields;
  const edit = (patch: EventPatch) => dispatch({ type: 'edit', id: event.id, patch });

  return (
    <aside className="card detail" aria-label={strings.itinerary.detailTitle}>
      <div className="card__head">
        <h2 className="card__title">{strings.itinerary.detailTitle}</h2>
        {!event.published ? (
          <span className="chip chip--sample">{strings.itinerary.draft}</span>
        ) : null}
      </div>
      <form className="card__body form" onSubmit={(e) => e.preventDefault()}>
        <label className="field">
          <span className="field__label">{f.title}</span>
          <input
            className="field__input"
            value={event.title}
            onChange={(e) => edit({ title: e.target.value })}
          />
        </label>
        <div className="field__row">
          <label className="field">
            <span className="field__label">{f.kind}</span>
            <select
              className="field__input"
              value={event.kind}
              onChange={(e) => edit({ kind: e.target.value as ItineraryEvent['kind'] })}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {strings.kind[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">{f.status}</span>
            <select
              className="field__input"
              value={event.status}
              onChange={(e) => edit({ status: e.target.value as ItineraryEvent['status'] })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {strings.status[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field__row">
          <label className="field">
            <span className="field__label">{f.start}</span>
            <input
              className="field__input"
              type="time"
              value={event.start}
              onChange={(e) => edit({ start: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">{f.end}</span>
            <input
              className="field__input"
              type="time"
              value={event.end ?? ''}
              onChange={(e) => edit({ end: e.target.value || undefined })}
            />
          </label>
        </div>
        <p className="field__hint">{event.timeZone.replace('_', ' ')} local time</p>
        <label className="field">
          <span className="field__label">{f.place}</span>
          <input
            className="field__input"
            value={event.place}
            onChange={(e) => edit({ place: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">{f.pax}</span>
          <select
            className="field__input"
            value={event.pax === 'all' ? 'all' : String(event.pax)}
            onChange={(e) =>
              edit({ pax: e.target.value === 'all' ? 'all' : Number(e.target.value) })
            }
          >
            <option value="all">{strings.itinerary.paxAll}</option>
            {[10, 18, 20, 28].map((n) => (
              <option key={n} value={n}>
                {n} pax
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{f.note}</span>
          <textarea
            className="field__input"
            rows={3}
            value={event.note ?? ''}
            onChange={(e) => edit({ note: e.target.value || undefined })}
          />
        </label>
        <div className="form__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => dispatch({ type: 'remove', id: event.id })}
          >
            {strings.itinerary.remove}
          </button>
        </div>
      </form>
    </aside>
  );
}
