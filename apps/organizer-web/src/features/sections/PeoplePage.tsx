// Copyright 2026- At Day. All rights reserved.
// People & groups (gallery #26). Roster table with role/group filters, join status, guardian
// binding, and the care-note indicator (D27: the note itself is behind a reveal, never listed).

import { useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { FROZEN_NOW } from '../../fixtures/korea-concert-tour';
import { type Person, people, peopleTotals } from '../../fixtures/sections';
import { relativeTo } from '../../lib/format';
import { strings } from '../../lib/strings';
import { Card, Initials, SectionPage } from './SectionPage';

const s = strings.people;
type Filter = 'all' | Person['role'];

export function PeoplePage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [group, setGroup] = useState<'all' | 'Bus A' | 'Bus B'>('all');
  const rows = people.filter(
    (p) => (filter === 'all' || p.role === filter) && (group === 'all' || p.group === group),
  );
  const byId = new Map(people.map((p) => [p.id, p]));
  return (
    <SectionPage
      title={strings.nav.people}
      subtitle={s.subtitle(peopleTotals.travelers, peopleTotals.guardians, peopleTotals.leaders)}
      actions={
        <button type="button" className="btn btn--primary btn--sm">
          <Icons.plus /> {s.invite}
        </button>
      }
    >
      <div className="stats stats--3">
        <div className="card stat">
          <span className="stat__icon stat__icon--brand">
            <Icons.people />
          </span>
          <div>
            <div className="stat__value" data-testid="people-joined">
              {peopleTotals.joined}
            </div>
            <div className="stat__label">{s.joined}</div>
          </div>
        </div>
        <div className="card stat">
          <span className="stat__icon stat__icon--accent">
            <Icons.bus />
          </span>
          <div>
            <div className="stat__value">2</div>
            <div className="stat__label">{s.groups}</div>
          </div>
        </div>
        <div className="card stat">
          <span className="stat__icon stat__icon--danger">
            <Icons.alert />
          </span>
          <div>
            <div className="stat__value">
              {peopleTotals.travelers +
                peopleTotals.guardians +
                peopleTotals.leaders -
                peopleTotals.joined}
            </div>
            <div className="stat__label">{s.notJoined}</div>
          </div>
        </div>
      </div>
      <Card title={s.roster} id="people-roster">
        <fieldset className="filters">
          <legend className="sr-only">{s.filters}</legend>
          {(['all', 'traveler', 'guardian', 'leader'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`chip chip--filter${filter === f ? ' chip--on' : ''}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {s.filter[f]}
            </button>
          ))}
          <span className="filters__sep" aria-hidden="true" />
          {(['all', 'Bus A', 'Bus B'] as const).map((g) => (
            <button
              key={g}
              type="button"
              className={`chip chip--filter${group === g ? ' chip--on' : ''}`}
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
            >
              {g === 'all' ? s.allGroups : g}
            </button>
          ))}
        </fieldset>
        <table className="table table--people" data-testid="people-table">
          <thead>
            <tr>
              <th>{s.colName}</th>
              <th>{s.colRole}</th>
              <th>{s.colGroup}</th>
              <th>{s.colStatus}</th>
              <th>{s.colLastAck}</th>
              <th>{s.colNotes}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="person">
                    <Initials name={p.name} />
                    <span>
                      {p.name}
                      {p.guardianOf ? (
                        <small className="muted">
                          {' '}
                          · {s.guardianOf(byId.get(p.guardianOf)?.name ?? '')}
                        </small>
                      ) : null}
                    </span>
                  </span>
                </td>
                <td>{s.filter[p.role]}</td>
                <td>{p.group ?? '—'}</td>
                <td>
                  <span className={`chip chip--${p.status}`}>{s.status[p.status]}</span>
                </td>
                <td className="muted">{p.lastAckAt ? relativeTo(FROZEN_NOW, p.lastAckAt) : '—'}</td>
                <td>
                  {p.hasCareNote ? (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      aria-label={s.revealNote(p.name)}
                    >
                      <Icons.shield /> {s.careNote}
                    </button>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">{s.showing(rows.length, people.length)}</p>
      </Card>
    </SectionPage>
  );
}
