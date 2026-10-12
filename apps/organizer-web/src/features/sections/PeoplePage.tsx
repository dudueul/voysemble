// Copyright 2026- At Day. All rights reserved.
// People & groups (gallery #26). Live (slice 023) when the active organization has a trip: the
// roster from the API with invite status (D12), guardian binding, last acknowledgment, and group
// chips from the real groups. Sample mode keeps the fixture. The care-note column (D27) stays
// honest: a dash in live mode, never a fake note.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PersonTimeline } from '@voysemble/contracts';
import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { FROZEN_NOW } from '../../fixtures/korea-concert-tour';
import { people, peopleTotals } from '../../fixtures/sections';
import { ApiError } from '../../lib/api-client';
import { relativeTo } from '../../lib/format';
import {
  buildPeople,
  joinStatusOf,
  type PeopleModel,
  type PersonRow,
} from '../../lib/people-model';
import {
  orgsQuery,
  personTimelineQuery,
  pickActiveOrg,
  roster as rosterApi,
  rosterQuery,
  tripsQuery,
} from '../../lib/session';
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

/** Edit, revoke the code, remove the row (slice 028, D12). Joined rows wait for D28. */
function RosterActions({
  orgId,
  tripId,
  card,
  onRemoved,
}: {
  orgId: string;
  tripId: string;
  card: PersonTimeline;
  onRemoved: () => void;
}) {
  const qc = useQueryClient();
  const p = card.participation;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.displayName);
  const [group, setGroup] = useState(p.groupName ?? '');
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: rosterQuery(orgId, tripId).queryKey });
    void qc.invalidateQueries({ queryKey: personTimelineQuery(orgId, tripId, p.id).queryKey });
  };
  const save = useMutation({
    mutationFn: () =>
      rosterApi.update(orgId, tripId, p.id, {
        displayName: name.trim(),
        groupName: group.trim() || null,
      }),
    onSuccess: () => {
      setEditing(false);
      setNote(s.saved);
      refresh();
    },
    onError: () => setNote(s.saveFailed),
  });
  const revoke = useMutation({
    mutationFn: () => rosterApi.revokeInvite(orgId, tripId, p.id),
    onSuccess: (r) => {
      setNote(s.revoked(r.revoked));
      refresh();
    },
    onError: () => setNote(s.revokeFailed),
  });
  const remove = useMutation({
    mutationFn: () => rosterApi.remove(orgId, tripId, p.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rosterQuery(orgId, tripId).queryKey });
      onRemoved();
    },
    onError: () => {
      setConfirming(false);
      setNote(s.removeFailed);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) save.mutate();
  };
  const joined = p.invite === 'joined';
  return (
    <div className="person-card__actions" data-testid="roster-actions">
      {editing ? (
        <form className="form form--inline" onSubmit={submit} aria-label={s.edit}>
          <label className="field">
            <span className="field__label">{s.editName}</span>
            <input
              className="field__input"
              value={name}
              maxLength={80}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">{s.editGroup}</span>
            <input
              className="field__input"
              value={group}
              maxLength={40}
              onChange={(e) => setGroup(e.target.value)}
            />
          </label>
          <div className="form__actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setEditing(false)}
            >
              {s.cancel}
            </button>
            <button type="submit" className="btn btn--primary btn--sm" disabled={save.isPending}>
              {s.save}
            </button>
          </div>
        </form>
      ) : confirming ? (
        <fieldset className="form__actions fieldset--plain">
          <legend className="sr-only">{s.remove}</legend>
          <span className="small">{s.removeConfirm(p.displayName, card.guardians.length)}</span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setConfirming(false)}
          >
            {s.cancel}
          </button>
          <button
            type="button"
            className="btn btn--danger btn--sm"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {s.removeYes}
          </button>
        </fieldset>
      ) : (
        <div className="form__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
            {s.edit}
          </button>
          {!joined && (p.invite === 'issued' || p.invite === 'expired') ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate()}
            >
              {s.revokeCode}
            </button>
          ) : null}
          {!joined ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setConfirming(true)}
            >
              {s.remove}
            </button>
          ) : (
            <span className="muted small">{s.joinedNote}</span>
          )}
        </div>
      )}
      {note ? (
        <p className="small muted" role="status" data-testid="roster-action-status">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** One person's card and timeline (slice 026, D17), beside the roster in live mode. */
function PersonCard({
  orgId,
  tripId,
  participationId,
  now,
  onClose,
}: {
  orgId: string;
  tripId: string;
  participationId: string;
  now: string;
  onClose: () => void;
}) {
  const q = useQuery(personTimelineQuery(orgId, tripId, participationId));
  const close = (
    <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
      {s.close}
    </button>
  );
  if (q.isPending) {
    return (
      <Card title={s.card} id="person-card-title" action={close}>
        <p className="state__body" role="status">
          {s.cardLoading}
        </p>
      </Card>
    );
  }
  if (q.isError) {
    return (
      <Card title={s.card} id="person-card-title" action={close}>
        <p className="field__error" role="alert">
          {s.cardFailed}{' '}
          {q.error instanceof ApiError ? `(${strings.auth.reference(q.error.correlationId)})` : ''}
        </p>
      </Card>
    );
  }
  const card = q.data;
  const p = card.participation;
  const status = joinStatusOf(p.invite);
  return (
    <Card title={s.card} id="person-card-title" action={close}>
      <div data-testid="person-card">
        <div className="person-card__head">
          <Initials name={p.displayName} />
          <div>
            <div className="person-card__name">{p.displayName}</div>
            <div className="muted small">
              {s.filter[p.role]} · {p.groupName ?? '—'} ·{' '}
              <span className={`chip chip--${status}`}>{s.status[status]}</span>
            </div>
          </div>
        </div>
        <div className="person-card__links">
          {card.guardianOf ? (
            <span>
              {s.guardianOf(card.guardianOf.displayName)} ·{' '}
              {s.status[joinStatusOf(card.guardianOf.invite)]}
            </span>
          ) : null}
          {p.role === 'traveler' ? (
            card.guardians.length === 0 ? (
              <span className="muted">{s.noGuardians}</span>
            ) : (
              card.guardians.map((g) => (
                <span key={g.participationId}>
                  {s.guardians}: {g.displayName} · {s.status[joinStatusOf(g.invite)]}
                </span>
              ))
            )
          ) : null}
        </div>
        <RosterActions orgId={orgId} tripId={tripId} card={card} onRemoved={onClose} />
        <div className="person-card__soon">
          <span>{s.careNoteSoon}</span>
        </div>
        <h3 className="card__subtitle">{s.timeline}</h3>
        {card.entries.length === 0 ? (
          <p className="muted small" role="status">
            {s.noEvents}
          </p>
        ) : (
          <ol className="timeline" data-testid="timeline">
            {card.entries.map((e) => (
              <li className="timeline__item" key={`${e.kind}-${e.at}-${e.title}`}>
                <span className="chip chip--scheduled timeline__kind">
                  {s.kind[e.kind] ?? e.kind}
                </span>
                <div>
                  <div className="timeline__title">{e.title}</div>
                  {e.detail ? <div className="timeline__detail">{e.detail}</div> : null}
                  <div className="timeline__detail">{relativeTo(now, e.at)}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

function PeopleTable({
  model,
  live,
  now,
  action,
  status,
  selectedId = null,
  onSelect,
  card,
}: {
  model: PeopleModel;
  live: boolean;
  /** Reference instant for "last ack": the frozen fixture clock or the real one. */
  now: string;
  action: ReactNode;
  /** Replaces the table while loading, failed, or empty. */
  status?: ReactNode;
  /** Live mode: the selected person and the card rendered beside the roster. */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  card?: ReactNode;
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
      <div className={`people-layout${card ? ' people-layout--open' : ''}`}>
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
                  <tr
                    key={p.id}
                    data-testid={`person-${p.id}`}
                    aria-selected={onSelect ? p.id === selectedId : undefined}
                  >
                    <td>
                      <span className="person">
                        <Initials name={p.name} />
                        <span>
                          {onSelect ? (
                            <button
                              type="button"
                              className="linkbtn"
                              aria-label={s.open(p.name)}
                              onClick={() => onSelect(p.id)}
                            >
                              {p.name}
                            </button>
                          ) : (
                            p.name
                          )}
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
            {live && !card && model.rows.length > 0 ? ` ${s.cardHint}` : ''}
          </p>
        </Card>
        {card}
      </div>
    </SectionPage>
  );
}

export function PeoplePage() {
  const [selected, setSelected] = useState<string | null>(null);
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
  const selectedId = selected && model.rows.some((r) => r.id === selected) ? selected : null;
  return (
    <PeopleTable
      model={model}
      live
      now={now}
      action={action}
      selectedId={selectedId}
      onSelect={setSelected}
      card={
        selectedId ? (
          <PersonCard
            orgId={org.id}
            tripId={trip.id}
            participationId={selectedId}
            now={now}
            onClose={() => setSelected(null)}
          />
        ) : null
      }
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
