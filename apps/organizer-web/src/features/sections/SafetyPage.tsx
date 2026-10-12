// Copyright 2026- At Day. All rights reserved.
// Safety: meeting window map (gallery #25, D15), head count missing list (D25), incident cards
// (D17). Incidents are real (slice 013): cards the head count sync opened for the active
// organization's first trip, resolved here with a note. Meeting windows are real (slice 029): the
// current window with each member's state (inside, outside, uncertain, stale, opted out) drawn
// on the schematic map with deterministic spots, a close button, and a form that opens one with
// the meeting point. The map is a schematic SVG (no tiles, no person's coordinates). The missing
// list stays a fixture with its own "Sample data" chip. Guardians never see this page's content.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Incident, latestMissingOf, type MeetingWindow } from '@voysemble/contracts';
import { type FormEvent, useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { FROZEN_NOW } from '../../fixtures/korea-concert-tour';
import {
  headcountMissing,
  incidents as incidentFixture,
  meetingWindow,
  type WindowState,
} from '../../fixtures/sections';
import { ApiError } from '../../lib/api-client';
import { formatTime, relativeTo } from '../../lib/format';
import {
  headcountsQuery,
  incidents as incidentsApi,
  incidentsQuery,
  orgsQuery,
  pickActiveOrg,
  tripsQuery,
  windows as windowsApi,
  windowsQuery,
} from '../../lib/session';
import { strings } from '../../lib/strings';
import { type SchematicMember, schematicMembers } from '../../lib/window-schematic';
import { Card, Initials, SectionPage } from './SectionPage';

const s = strings.safety;

function SampleChip() {
  return <span className="chip chip--sample">{strings.dashboard.simulated}</span>;
}

function LiveIncident({ orgId, tripId, i }: { orgId: string; tripId: string; i: Incident }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: incidentsQuery(orgId, tripId).queryKey });
  const resolve = useMutation({
    mutationFn: () => incidentsApi.resolve(orgId, tripId, i.id, note.trim() || null),
    onSuccess: invalidate,
  });
  const send = useMutation({
    mutationFn: () => incidentsApi.sendGuardianMessage(orgId, tripId, i.id),
    onSuccess: invalidate,
  });
  const open = i.status === 'open';
  const latest = i.confirmations[0] ?? null;
  const now = new Date().toISOString();
  return (
    <li className="incident" data-testid={`incident-${i.id}`}>
      <span
        className={`incident__badge incident__badge--${open ? 'open' : 'closed'}`}
        aria-hidden="true"
      >
        {open ? <Icons.alert /> : <Icons.check />}
      </span>
      <div className="incident__text">
        <strong>{i.title}</strong>
        <span className="muted small">
          {i.people.map((p) => p.displayName).join(', ')} · {s.opened} {relativeTo(now, i.openedAt)}{' '}
          · {i.openedByName}
        </span>
        <span className="small incident__confirmation" data-testid={`confirmation-${i.id}`}>
          {latest ? (
            <>
              <span className={`chip chip--${latest.status === 'with_group' ? 'done' : 'delayed'}`}>
                {s.confirmation[latest.status]}
              </span>{' '}
              {s.confirmedBy(
                latest.confirmedByName,
                latest.confirmedByRole,
                relativeTo(now, latest.confirmedAt),
              )}
              {latest.note ? ` · ${latest.note}` : ''}
            </>
          ) : (
            <span className="muted">{s.awaitingConfirmation}</span>
          )}
        </span>
        {i.guardianMessage ? (
          <span className="small incident__guardian" data-testid={`guardian-${i.id}`}>
            <span className="muted">
              {s.guardianMessageSent(relativeTo(now, i.guardianMessage.sentAt))}
            </span>
            <span lang="en">{i.guardianMessage.bodyEn}</span>
            <span lang="ko">{i.guardianMessage.bodyKo}</span>
          </span>
        ) : null}
        {open && latest ? (
          <span className="small">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={send.isPending}
              onClick={() => send.mutate()}
            >
              {s.sendGuardianMessage}
            </button>
            {send.isError ? (
              <span className="field__error" role="alert">
                {send.error instanceof ApiError ? send.error.message : s.guardianMessageFailed}
              </span>
            ) : null}
          </span>
        ) : null}
        {open ? (
          <span className="small incident__resolve">
            <input
              className="field__input field__input--inline"
              aria-label={s.resolveNote}
              placeholder={s.resolveNote}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate()}
            >
              {s.resolve}
            </button>
            {resolve.isError ? (
              <span className="field__error" role="alert">
                {resolve.error instanceof ApiError ? resolve.error.message : s.resolveFailed}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="small">
            {s.resolvedBy(i.resolvedByName ?? '', relativeTo(now, i.resolvedAt ?? i.openedAt))}
            {i.resolutionNote ? ` · ${i.resolutionNote}` : ''}
          </span>
        )}
      </div>
      <span className={`chip chip--${open ? 'delayed' : 'done'}`}>
        {open ? s.incidentStatus.open : s.incidentStatus.resolved}
      </span>
    </li>
  );
}

function LiveIncidents({ orgId, tripId }: { orgId: string; tripId: string }) {
  const list = useQuery(incidentsQuery(orgId, tripId));
  if (list.isPending) {
    return (
      <p className="state__body" role="status">
        {strings.states.loading}
      </p>
    );
  }
  if (list.isError) {
    return (
      <p className="field__error" role="alert">
        {list.error instanceof ApiError
          ? `${list.error.message} (${strings.auth.reference(list.error.correlationId)})`
          : String(list.error)}
      </p>
    );
  }
  if (list.data.length === 0) {
    return (
      <p className="state__body" role="status">
        {s.noIncidents}
      </p>
    );
  }
  return (
    <ul className="list" data-testid="incident-list">
      {list.data.map((i) => (
        <LiveIncident key={i.id} orgId={orgId} tripId={tripId} i={i} />
      ))}
    </ul>
  );
}

function FixtureIncidents() {
  return (
    <ul className="list" data-testid="incident-list">
      {incidentFixture.map((i) => (
        <li key={i.id} className="incident">
          <span className={`incident__badge incident__badge--${i.status}`} aria-hidden="true">
            {i.status === 'open' ? <Icons.alert /> : <Icons.check />}
          </span>
          <div className="incident__text">
            <strong>{i.title}</strong>
            <span className="muted small">
              {i.person} · {s.opened} {relativeTo(FROZEN_NOW, i.openedAt)}
            </span>
            {i.confirmedBy ? (
              <span className="small">
                {s.confirmed(i.confirmedBy, relativeTo(FROZEN_NOW, i.confirmedAt ?? i.openedAt))}
                {i.guardianNotified ? ` · ${s.guardianNotified}` : ''}
              </span>
            ) : (
              <span className="small">
                <button type="button" className="linkbtn">
                  {s.pingLeader}
                </button>
              </span>
            )}
          </div>
          <span className={`chip chip--${i.status === 'open' ? 'delayed' : 'done'}`}>
            {s.incidentStatus[i.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}

const STATE_TONE: Record<WindowState, string> = {
  inside: 'ok',
  outside: 'danger',
  uncertain: 'warn',
  stale: 'muted',
  opted_out: 'muted',
};

const STATES = ['inside', 'outside', 'uncertain', 'stale', 'opted_out'] as const;

const R = 120;

/** The schematic zone: streets, the zone circle, one spot per sharing member, the legend with counts. */
function SchematicMap({
  place,
  members,
  counts,
}: {
  place: string;
  members: SchematicMember[];
  counts: Record<WindowState, number>;
}) {
  const label = s.mapLabel(counts.inside, members.length);
  return (
    <div className="mapwrap">
      <svg className="map" viewBox="0 0 420 300" role="img" aria-label={label}>
        <title>{label}</title>
        <defs>
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M30 0H0V30" fill="none" stroke="var(--vy-border)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="420" height="300" fill="url(#grid)" />
        <path
          d="M0 190 C 80 170, 140 230, 230 200 S 360 150, 420 170"
          fill="none"
          stroke="var(--vy-color-neutral-300, #cbd5e1)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M150 0 C 160 90, 120 160, 170 300"
          fill="none"
          stroke="var(--vy-color-neutral-300, #cbd5e1)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <circle cx="210" cy="150" r={R} className="map__zone" />
        <circle cx="210" cy="150" r="6" className="map__center" />
        <text x="210" y="150" dy="28" textAnchor="middle" className="map__label">
          {place}
        </text>
        {members
          .filter((m) => m.state !== 'opted_out')
          .map((m) => (
            <g key={m.id} className={`map__pin map__pin--${STATE_TONE[m.state]}`}>
              <circle cx={210 + m.dx * R * 0.9} cy={150 + m.dy * R * 0.9} r="9" />
              <title>
                {m.name}: {s.state[m.state]}
              </title>
            </g>
          ))}
      </svg>
      <ul className="legend" aria-label={s.legend}>
        {STATES.map((k) => (
          <li key={k}>
            <span className={`dot dot--${STATE_TONE[k]}`} aria-hidden="true" />
            {s.state[k]} <strong data-testid={`win-${k}`}>{counts[k]}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FixtureWindowCard() {
  const counts = meetingWindow.members.reduce(
    (acc, m) => {
      acc[m.state] += 1;
      return acc;
    },
    { inside: 0, outside: 0, uncertain: 0, stale: 0, opted_out: 0 } as Record<WindowState, number>,
  );
  return (
    <Card
      title={s.window(meetingWindow.label)}
      id="safety-window"
      action={
        <span className="muted small">
          {s.windowMeta(meetingWindow.radiusMeters, meetingWindow.openedBy)} <SampleChip />
        </span>
      }
    >
      <SchematicMap place={meetingWindow.place} members={meetingWindow.members} counts={counts} />
      <p className="muted small">
        {s.windowTimes(meetingWindow.startsAt, meetingWindow.endsAt)} · {s.autoStop}
      </p>
    </Card>
  );
}

function countsOf(w: MeetingWindow): Record<WindowState, number> {
  return {
    inside: w.counts.inside,
    outside: w.counts.outside,
    uncertain: w.counts.uncertain,
    stale: w.counts.stale,
    opted_out: w.counts.optedOut,
  };
}

/** Local `YYYY-MM-DDTHH:mm` for a datetime-local input. */
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The staff form: label, place, radius, time range, groups and the meeting point. */
function OpenWindowForm({ orgId, tripId }: { orgId: string; tripId: string }) {
  const qc = useQueryClient();
  const now = new Date();
  const [label, setLabel] = useState('');
  const [place, setPlace] = useState('');
  const [radius, setRadius] = useState('200');
  const [startsAt, setStartsAt] = useState(localInputValue(now));
  const [endsAt, setEndsAt] = useState(localInputValue(new Date(now.getTime() + 45 * 60_000)));
  const [groups, setGroups] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const open = useMutation({
    mutationFn: () =>
      windowsApi.open(orgId, tripId, {
        label: label.trim(),
        place: place.trim(),
        radiusMeters: Number(radius),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        groups: groups
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean),
        center: { lat: Number(lat), lng: Number(lng) },
      }),
    onSuccess: () => {
      setLabel('');
      setPlace('');
      void qc.invalidateQueries({ queryKey: windowsQuery(orgId, tripId).queryKey });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    open.mutate();
  };
  return (
    <form className="form form--inline window-form" onSubmit={submit} aria-label={s.openWindow}>
      <p className="field__hint">{s.openWindowIntro}</p>
      <div className="field__row">
        <label className="field">
          <span className="field__label">{s.form.label}</span>
          <input
            className="field__input"
            required
            maxLength={80}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">{s.form.place}</span>
          <input
            className="field__input"
            required
            maxLength={120}
            value={place}
            onChange={(e) => setPlace(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">{s.form.radius}</span>
          <input
            className="field__input"
            type="number"
            min={25}
            max={2000}
            step={5}
            required
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
          />
        </label>
      </div>
      <div className="field__row">
        <label className="field">
          <span className="field__label">{s.form.startsAt}</span>
          <input
            className="field__input"
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">{s.form.endsAt}</span>
          <input
            className="field__input"
            type="datetime-local"
            required
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">{s.form.groups}</span>
          <input
            className="field__input"
            value={groups}
            onChange={(e) => setGroups(e.target.value)}
          />
        </label>
      </div>
      <div className="field__row">
        <label className="field">
          <span className="field__label">{s.form.lat}</span>
          <input
            className="field__input"
            type="number"
            step="any"
            min={-90}
            max={90}
            required
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">{s.form.lng}</span>
          <input
            className="field__input"
            type="number"
            step="any"
            min={-180}
            max={180}
            required
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
        </label>
      </div>
      <div className="form__actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={open.isPending}>
          {s.form.submit}
        </button>
        {open.isError ? (
          <span className="field__error" role="alert">
            {open.error instanceof ApiError
              ? open.error.status === 400
                ? s.form.invalid
                : open.error.message
              : s.form.failed}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function LiveWindowCard({
  orgId,
  tripId,
  w,
  timeZone,
}: {
  orgId: string;
  tripId: string;
  w: MeetingWindow;
  timeZone: string;
}) {
  const qc = useQueryClient();
  const close = useMutation({
    mutationFn: () => windowsApi.close(orgId, tripId, w.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: windowsQuery(orgId, tripId).queryKey }),
  });
  const now = new Date().toISOString();
  return (
    <Card
      title={s.window(w.label)}
      id="safety-window"
      action={
        <span className="window-actions">
          <span className="muted small">
            {s.windowLiveMeta(w.radiusMeters, w.openedByName, w.groups)}
          </span>
          <span
            className={`chip chip--${w.status === 'open' ? 'now' : 'scheduled'}`}
            data-testid="window-status"
          >
            {s.windowStatus[w.status]}
          </span>
          <span className="chip chip--active">{strings.dashboard.live}</span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={close.isPending}
            onClick={() => close.mutate()}
          >
            {s.closeWindow}
          </button>
          {close.isError ? (
            <span className="field__error" role="alert">
              {close.error instanceof ApiError ? close.error.message : s.closeFailed}
            </span>
          ) : null}
        </span>
      }
    >
      <SchematicMap place={w.place} members={schematicMembers(w.members)} counts={countsOf(w)} />
      <p className="muted small">
        {s.windowLocalTimes(
          formatTime(w.startsAt, timeZone),
          formatTime(w.endsAt, timeZone),
          timeZone,
        )}{' '}
        · {s.autoStop}
      </p>
      <ul className="window-members" data-testid="window-members" aria-label={s.members}>
        {w.members.map((m) => (
          <li key={m.participationId}>
            <strong>{m.displayName}</strong>
            <span className="muted small">
              {m.groupName ?? ''}
              {m.reportedAt
                ? ` · ${s.reportedAt(relativeTo(now, m.reportedAt))}`
                : ` · ${s.notReported}`}
            </span>
            <span className={`chip chip--tiny chip--win-${m.state}`}>{s.state[m.state]}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The current window (open, else scheduled) with the form when there is none, and the recent closed ones. */
function LiveWindows({
  orgId,
  tripId,
  timeZone,
}: {
  orgId: string;
  tripId: string;
  timeZone: string;
}) {
  const list = useQuery(windowsQuery(orgId, tripId));
  if (list.isPending) {
    return (
      <Card title={s.openWindow} id="safety-window">
        <p className="state__body" role="status">
          {strings.states.loading}
        </p>
      </Card>
    );
  }
  if (list.isError) {
    return (
      <Card title={s.openWindow} id="safety-window">
        <p className="field__error" role="alert">
          {list.error instanceof ApiError
            ? `${list.error.message} (${strings.auth.reference(list.error.correlationId)})`
            : String(list.error)}
        </p>
      </Card>
    );
  }
  const current =
    list.data.find((w) => w.status === 'open') ??
    list.data.find((w) => w.status === 'scheduled') ??
    null;
  const earlier = list.data.filter((w) => w.id !== current?.id).slice(0, 5);
  return (
    <>
      {current ? (
        <LiveWindowCard orgId={orgId} tripId={tripId} w={current} timeZone={timeZone} />
      ) : (
        <Card
          title={s.openWindow}
          id="safety-window"
          action={<span className="chip chip--active">{strings.dashboard.live}</span>}
        >
          <p className="state__body" role="status" data-testid="no-window">
            {s.noWindow}
          </p>
          <OpenWindowForm orgId={orgId} tripId={tripId} />
        </Card>
      )}
      {earlier.length ? (
        <Card title={s.earlierWindows} id="safety-earlier-windows">
          <ul className="list list--plain" data-testid="earlier-windows">
            {earlier.map((w) => (
              <li key={w.id}>
                <strong>{w.label}</strong>{' '}
                <span className="muted small">
                  {w.place} · {formatTime(w.startsAt, timeZone)}–{formatTime(w.endsAt, timeZone)} ·{' '}
                  {s.state.inside} {w.counts.inside}/{w.counts.total}
                </span>{' '}
                <span className="chip chip--tiny chip--done">{s.windowStatus[w.status]}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

/** D25 on the console (slice 034): per group, the latest closed head count that left travelers missing. */
function LiveMissing({ orgId, tripId }: { orgId: string; tripId: string }) {
  const q = useQuery(headcountsQuery(orgId, tripId));
  if (q.isPending) {
    return (
      <p className="state__body" role="status">
        {strings.states.loading}
      </p>
    );
  }
  if (q.isError) {
    return (
      <p className="field__error" role="alert">
        {s.missingLoadFailed}
      </p>
    );
  }
  const groups = latestMissingOf(q.data);
  const now = new Date().toISOString();
  return (
    <>
      <p className="muted small">{s.missingLive}</p>
      {groups.length === 0 ? (
        <p className="state__body" role="status" data-testid="missing-none">
          {s.missingNone}
        </p>
      ) : (
        <ul className="list" data-testid="missing-list">
          {groups.map((g) =>
            g.missing.map((m) => (
              <li key={`${g.headcountId}-${m.participationId}`} className="missing">
                <Initials name={m.displayName} />
                <div className="incident__text">
                  <strong>{m.displayName}</strong>
                  <span className="muted small">
                    {s.missingClosed(
                      g.groupName ?? 'Whole trip',
                      g.closedAtDevice,
                      g.openedByName,
                      g.missing.length,
                    )}{' '}
                    · {relativeTo(now, g.receivedAt)}
                  </span>
                </div>
                <span className="chip chip--delayed">{s.mark[m.mark]}</span>
              </li>
            )),
          )}
        </ul>
      )}
    </>
  );
}

export function SafetyPage() {
  const orgs = useQuery(orgsQuery);
  const org = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(org?.id ?? ''), enabled: Boolean(org) });
  const trip = trips.data?.[0] ?? null;
  const live = useQuery({
    ...incidentsQuery(org?.id ?? '', trip?.id ?? ''),
    enabled: Boolean(org && trip),
  });
  const ready = Boolean(org && trip);
  const openCount = (live.data ?? []).filter((i) => i.status === 'open').length;
  return (
    <SectionPage
      title={strings.nav.safety}
      subtitle={ready && live.data ? `${s.liveIncidents(openCount)} · ${s.subtitle}` : s.subtitle}
      sample={false}
      className="safety"
    >
      <div className="grid">
        <div className="stack">
          {org && trip ? (
            <LiveWindows orgId={org.id} tripId={trip.id} timeZone={trip.timezone} />
          ) : (
            <FixtureWindowCard />
          )}
          <Card
            title={s.incidents}
            id="safety-incidents"
            action={ready ? undefined : <SampleChip />}
          >
            {org && trip ? (
              <LiveIncidents orgId={org.id} tripId={trip.id} />
            ) : orgs.isPending || (org !== null && trips.isPending) ? (
              <p className="state__body" role="status">
                {strings.states.loading}
              </p>
            ) : (
              <>
                <p className="muted small">
                  {s.noTrip}{' '}
                  <a href="/setup" className="linkbtn">
                    {strings.setup.nav}
                  </a>
                </p>
                <FixtureIncidents />
              </>
            )}
          </Card>
        </div>
        <div className="stack">
          {org && trip ? (
            <Card
              title={s.missing}
              id="safety-missing"
              action={<span className="chip chip--active">{strings.dashboard.live}</span>}
            >
              <LiveMissing orgId={org.id} tripId={trip.id} />
            </Card>
          ) : (
            <Card title={s.missing} id="safety-missing" action={<SampleChip />}>
              <p className="muted small">{s.missingIntro}</p>
              <ul className="list" data-testid="missing-list">
                {headcountMissing.map((m) => (
                  <li key={m.name} className="missing">
                    <Initials name={m.name} />
                    <div className="incident__text">
                      <strong>{m.name}</strong>
                      <span className="muted small">
                        {s.room} {m.room} · {s.lastAck} {relativeTo(FROZEN_NOW, m.lastAck)} ·{' '}
                        {s.state[m.windowState]}
                      </span>
                    </div>
                    <div className="missing__actions">
                      <button type="button" className="btn btn--ghost btn--sm">
                        {s.call}
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm">
                        {s.push}
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm">
                        {s.excuse}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title={s.emergency} id="safety-emergency">
            <ul className="list list--plain">
              <li>
                <strong>112</strong> <span className="muted">{s.localEmergency}</span>
              </li>
              <li>
                <strong>+39 06 0000 0000</strong> <span className="muted">{s.embassy}</span>
              </li>
              <li>
                <strong>Kim Daeun</strong> <span className="muted">{s.tourLead}</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </SectionPage>
  );
}
