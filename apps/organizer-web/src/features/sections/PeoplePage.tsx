// Copyright 2026- At Day. All rights reserved.
// People & groups (gallery #26). Live (slice 023) when the active organization has a trip: the
// roster from the API with invite status (D12), guardian binding, last acknowledgment, and group
// chips from the real groups. Sample mode keeps the fixture. The care-note column (D27) stays
// honest: a dash in live mode, never a fake note.

import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { FROZEN_NOW } from '../../fixtures/korea-concert-tour';
import { people, peopleTotals } from '../../fixtures/sections';
import { ApiError } from '../../lib/api-client';
import { relativeTo } from '../../lib/format';
import { buildPeople, type PeopleModel, type PersonRow } from '../../lib/people-model';
import { orgsQuery, pickActiveOrg, rosterQuery, tripsQuery } from '../../lib/session';
import { strings } from '../../lib/strings';
import { Card, Initials, SectionPage } from './SectionPage';

const s = strings.people;
type Filter = 'all' | PersonRow['role'];

const EMPTY: PeopleModel = {
  rows: [],
  groups: [],
  totals: { travelers: 0, guardians: 0, leaders: 0, joined: 0, notJoined: 0 },
};

/** The fixture mapped onto the live row shape so one table renders both modes. */
function fixtureModel(): PeopleModel {
  const byId = new Map(people.map((p) => [p.id, p.name]));
  const total = peopleTotals.travelers + peopleTotals.guardians + peopleTotals.leaders;
  return {
    rows: people.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      group: p.group,
      status: p.status,
      guardianOfName: p.guardianOf ? (byId.get(p.guardianOf) ?? null) : null,
      hasCareNote: p.hasCareNote,
      lastAckAt: p.lastAckAt ?? null,
    })),
    groups: ['Bus A', 'Bus B'],
    totals: { ...peopleTotals, notJoined: total - peopleTotals.joined },
  };
}

function PeopleTable({
  model,
  live,
  now,
  action,
  status,
}: {
  model: PeopleModel;
  live: boolean;
  /** Reference instant for "last ack": the frozen fixture clock or the real one. */
  now: string;
  action: ReactNode;
  /** Replaces the table while loading, failed, or empty. */
  status?: ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [group, setGroup] = useState<string>('all');
  const rows = model.rows.filter(
    (p) => (filter === 'all' || p.role === filter) && (group === 'all' || p.group === group),
  );
  const t = model.totals;
  return (
    <SectionPage
      title={strings.nav.people}
      subtitle={s.subtitle(t.travelers, t.guardians, t.leaders)}
      sample={!live}
      actions={
        <>
          {live ? <span className="chip chip--active">{strings.dashboard.live}</span> : null}
          {action}
        </>
      }
    >
      <div className="stats stats--3">
        <div className="card stat">
          <span className="stat__icon stat__icon--brand">
            <Icons.people />
          </span>
          <div>
            <div className="stat__value" data-testid="people-joined">
              {t.joined}
            </div>
            <div className="stat__label">{s.joined}</div>
          </div>
        </div>
        <div className="card stat">
          <span className="stat__icon stat__icon--accent">
            <Icons.bus />
          </span>
          <div>
            <div className="stat__value" data-testid="people-groups">
              {model.groups.length}
            </div>
            <div className="stat__label">{s.groups}</div>
          </div>
        </div>
        <div className="card stat">
          <span className="stat__icon stat__icon--danger">
            <Icons.alert />
          </span>
          <div>
            <div className="stat__value" data-testid="people-not-joined">
              {t.notJoined}
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
          {['all', ...model.groups].map((g) => (
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
        {status ?? (
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
                <tr key={p.id} data-testid={`person-${p.id}`}>
                  <td>
                    <span className="person">
                      <Initials name={p.name} />
                      <span>
                        {p.name}
                        {p.guardianOfName ? (
                          <small className="muted"> · {s.guardianOf(p.guardianOfName)}</small>
                        ) : null}
                      </span>
                    </span>
                  </td>
                  <td>{s.filter[p.role]}</td>
                  <td>{p.group ?? '—'}</td>
                  <td>
                    <span className={`chip chip--${p.status}`}>{s.status[p.status]}</span>
                  </td>
                  <td className="muted">{p.lastAckAt ? relativeTo(now, p.lastAckAt) : '—'}</td>
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
                      <span className="muted" title={live ? s.careNoteLater : undefined}>
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small">
          {live
            ? s.showingLive(rows.length, model.rows.length)
            : s.showing(rows.length, model.rows.length)}
        </p>
      </Card>
    </SectionPage>
  );
}

export function PeoplePage() {
  const orgs = useQuery(orgsQuery);
  const org = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(org?.id ?? ''), enabled: Boolean(org) });
  const trip = trips.data?.[0] ?? null;
  const roster = useQuery({
    ...rosterQuery(org?.id ?? '', trip?.id ?? ''),
    enabled: Boolean(org && trip),
  });
  // Invites are issued from the setup checklist (D26); the button is the same door in both modes.
  const action = (
    <a className="btn btn--primary btn--sm" href="/setup">
      <Icons.plus /> {s.invite}
    </a>
  );
  if (!(org && trip)) {
    return <PeopleTable model={fixtureModel()} live={false} now={FROZEN_NOW} action={action} />;
  }
  const now = new Date().toISOString();
  if (roster.isPending) {
    return (
      <PeopleTable
        model={EMPTY}
        live
        now={now}
        action={action}
        status={
          <p className="state__body" role="status">
            {s.loading}
          </p>
        }
      />
    );
  }
  if (roster.isError) {
    return (
      <PeopleTable
        model={EMPTY}
        live
        now={now}
        action={action}
        status={
          <p className="field__error" role="alert">
            {s.loadFailed}{' '}
            {roster.error instanceof ApiError
              ? `(${strings.auth.reference(roster.error.correlationId)})`
              : ''}
          </p>
        }
      />
    );
  }
  const model = buildPeople(roster.data);
  return (
    <PeopleTable
      model={model}
      live
      now={now}
      action={action}
      status={
        model.rows.length === 0 ? (
          <p className="state__body" role="status">
            {s.empty}
          </p>
        ) : undefined
      }
    />
  );
}
