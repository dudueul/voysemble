// Copyright 2026- At Day. All rights reserved.
// Safety: meeting window map (gallery #25, D15), head count missing list (D25), incident cards
// (D17). The map is a schematic SVG (no tiles, no real coordinates): the zone circle, members by
// state, and a legend. Guardians never see this page's content.

import { Icons } from '../../app/shell/icons';
import { FROZEN_NOW } from '../../fixtures/korea-concert-tour';
import {
  headcountMissing,
  incidents,
  meetingWindow,
  type WindowState,
} from '../../fixtures/sections';
import { relativeTo } from '../../lib/format';
import { strings } from '../../lib/strings';
import { Card, Initials, SectionPage } from './SectionPage';

const s = strings.safety;

const STATE_TONE: Record<WindowState, string> = {
  inside: 'ok',
  outside: 'danger',
  uncertain: 'warn',
  stale: 'muted',
  opted_out: 'muted',
};

export function SafetyPage() {
  const counts = meetingWindow.members.reduce(
    (acc, m) => {
      acc[m.state] += 1;
      return acc;
    },
    { inside: 0, outside: 0, uncertain: 0, stale: 0, opted_out: 0 } as Record<WindowState, number>,
  );
  const R = 120;
  return (
    <SectionPage title={strings.nav.safety} subtitle={s.subtitle} className="safety">
      <div className="grid">
        <div className="stack">
          <Card
            title={s.window(meetingWindow.label)}
            id="safety-window"
            action={
              <span className="muted small">
                {s.windowMeta(meetingWindow.radiusMeters, meetingWindow.openedBy)}
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
          <Card title={s.incidents} id="safety-incidents">
            <ul className="list" data-testid="incident-list">
              {incidents.map((i) => (
                <li key={i.id} className="incident">
                  <span
                    className={`incident__badge incident__badge--${i.status}`}
                    aria-hidden="true"
                  >
                    {i.status === 'open' ? <Icons.alert /> : <Icons.check />}
                  </span>
                  <div className="incident__text">
                    <strong>{i.title}</strong>
                    <span className="muted small">
                      {i.person} · {s.opened} {relativeTo(FROZEN_NOW, i.openedAt)}
                    </span>
                    {i.confirmedBy ? (
                      <span className="small">
                        {s.confirmed(
                          i.confirmedBy,
                          relativeTo(FROZEN_NOW, i.confirmedAt ?? i.openedAt),
                        )}
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
          </Card>
        </div>
        <div className="stack">
          <Card title={s.missing} id="safety-missing">
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
