// Copyright 2026- At Day. All rights reserved.
// Trip list with synthetic cover art. Real licensed photography is a later asset slice (doc 01 §15).
// Since slice 063 the panel is where the organizer switches trips ("Open" on a row makes it the
// console's active trip) and adds one (the form folds out of "New trip"; the new trip becomes
// the active one). Both only when the page hands the callbacks in: the sample has neither.

import { useState } from 'react';
import { Icons } from '../../app/shell/icons';
import type { Trip } from '../../fixtures/korea-concert-tour';
import { formatDateRange } from '../../lib/format';
import { strings } from '../../lib/strings';

export type NewTripInput = { name: string; startsOn: string; endsOn: string; timezone: string };

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
  onSwitchTrip,
  onCreateTrip,
}: {
  trips: Trip[];
  activeTripId: string | null;
  /** Make a trip the console's active one (live only). */
  onSwitchTrip?: ((tripId: string) => void) | undefined;
  /** Create a trip; the page makes it the active one (live only). */
  onCreateTrip?: ((input: NewTripInput) => Promise<void>) | undefined;
}) {
  const s = strings.dashboard;
  const [adding, setAdding] = useState(false);
  const active = trips.find((t) => t.id === activeTripId) ?? null;
  return (
    <section className="card" aria-labelledby="tr-title">
      <div className="card__head">
        <h2 className="card__title" id="tr-title">
          {s.upcomingTrips}
        </h2>
        <button
          type="button"
          className="link"
          aria-expanded={onCreateTrip ? adding : undefined}
          onClick={() => setAdding((v) => !v)}
        >
          <Icons.plus width="16" height="16" />
          {s.newTrip}
        </button>
      </div>
      <div className="card__body trips">
        {adding && onCreateTrip ? (
          <NewTripForm
            timezone={active?.timeZone ?? 'Asia/Seoul'}
            onCreate={async (input) => {
              await onCreateTrip(input);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : null}
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
            <div className="trip__side">
              <span className={`chip chip--${t.status}`}>{strings.tripStatus[t.status]}</span>
              {onSwitchTrip && t.id !== activeTripId ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  aria-label={s.openTripOf(t.name)}
                  onClick={() => onSwitchTrip(t.id)}
                >
                  {s.openTrip}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Name, dates and zone; the zone starts as the active trip's. The error, if any, is the API's words. */
function NewTripForm({
  timezone,
  onCreate,
  onCancel,
}: {
  timezone: string;
  onCreate: (input: NewTripInput) => Promise<void>;
  onCancel: () => void;
}) {
  const s = strings.dashboard;
  const labels = strings.setup;
  const [form, setForm] = useState<NewTripInput>({ name: '', startsOn: '', endsOn: '', timezone });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof NewTripInput) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onCreate(form);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : s.newTripFailed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="form trip-form"
      aria-label={s.newTrip}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="field">
        <span className="field__label">{labels.tripName}</span>
        <input
          className="field__input"
          name="name"
          required
          maxLength={160}
          value={form.name}
          onChange={set('name')}
        />
      </label>
      <div className="field__row">
        <label className="field">
          <span className="field__label">{labels.startsOn}</span>
          <input
            className="field__input"
            type="date"
            name="startsOn"
            required
            value={form.startsOn}
            onChange={set('startsOn')}
          />
        </label>
        <label className="field">
          <span className="field__label">{labels.endsOn}</span>
          <input
            className="field__input"
            type="date"
            name="endsOn"
            required
            value={form.endsOn}
            onChange={set('endsOn')}
          />
        </label>
        <label className="field">
          <span className="field__label">{labels.timezone}</span>
          <input
            className="field__input"
            name="timezone"
            required
            value={form.timezone}
            onChange={set('timezone')}
          />
        </label>
      </div>
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="form__actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
          {labels.createTrip}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
          {s.newTripCancel}
        </button>
      </div>
    </form>
  );
}
