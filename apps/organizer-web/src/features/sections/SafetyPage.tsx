// Copyright 2026- At Day. All rights reserved.
// Safety: meeting window map (gallery #25, D15), head count missing list (D25), incident cards
// (D17). Incidents are real (slice 013): cards the head count sync opened for the active
// organization's first trip, resolved here with a note. The window map and the missing list stay
// fixtures with their own "Sample data" chip. The map is a schematic SVG (no tiles, no real
// coordinates). Guardians never see this page's content.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Incident } from '@voysemble/contracts';
import { useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { FROZEN_NOW } from '../../fixtures/korea-concert-tour';
import {
  headcountMissing,
  incidents as incidentFixture,
  meetingWindow,
  type WindowState,
} from '../../fixtures/sections';
import { ApiError } from '../../lib/api-client';
import { relativeTo } from '../../lib/format';
import {
  incidents as incidentsApi,
  incidentsQuery,
  orgsQuery,
  pickActiveOrg,
  tripsQuery,
} from '../../lib/session';
import { strings } from '../../lib/strings';
import { Card, Initials, SectionPage } from './SectionPage';

const s = strings.safety;

function SampleChip() {
  return <span className="chip chip--sample">{strings.dashboard.simulated}</span>;
}

function LiveIncident({ orgId, tripId, i }: { orgId: string; tripId: string; i: Incident }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const resolve = useMutation({
    mutationFn: () => incidentsApi.resolve(orgId, tripId, i.id, note.trim() || null),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: incidentsQuery(orgId, tripId).queryKey }),
  });
  const open = i.status === 'open';
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
          {i.people.map((p) => p.displayName).join(', ')} · {s.opened}{' '}
          {relativeTo(new Date().toISOString(), i.openedAt)} · {i.openedByName}
        </span>
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
            {s.resolvedBy(
              i.resolvedByName ?? '',
              relativeTo(new Date().toISOString(), i.resolvedAt ?? i.openedAt),
            )}
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
  const counts = meetingWindow.members.reduce(
    (acc, m) => {
      acc[m.state] += 1;
      return acc;
    },
    { inside: 0, outside: 0, uncertain: 0, stale: 0, opted_out: 0 } as Record<WindowState, number>,
  );
  const R = 120;
  return (
    <SectionPage
      title={strings.nav.safety}
      subtitle={ready && live.data ? `${s.liveIncidents(openCount)} · ${s.subtitle}` : s.subtitle}
      sample={false}
      className="safety"
    >
      <div className="grid">
        <div className="stack">
          <Card
            title={s.window(meetingWindow.label)}
            id="safety-window"
            action={
              <span className="muted small">
                {s.windowMeta(meetingWindow.radiusMeters, meetingWindow.openedBy)} <SampleChip />
              </span>
            }
          >
            <div className="mapwrap">
              <svg
                className="map"
                viewBox="0 0 420 300"
                role="img"
                aria-label={s.mapLabel(counts.inside, meetingWindow.members.length)}
              >
                <title>{s.mapLabel(counts.inside, meetingWindow.members.length)}</title>
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
                  {meetingWindow.place}
                </text>
                {meetingWindow.members
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
                {(['inside', 'outside', 'uncertain', 'stale', 'opted_out'] as const).map((k) => (
                  <li key={k}>
                    <span className={`dot dot--${STATE_TONE[k]}`} aria-hidden="true" />
                    {s.state[k]} <strong data-testid={`win-${k}`}>{counts[k]}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <p className="muted small">
              {s.windowTimes(meetingWindow.startsAt, meetingWindow.endsAt)} · {s.autoStop}
            </p>
          </Card>
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
