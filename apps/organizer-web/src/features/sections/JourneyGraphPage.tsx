// Copyright 2026- At Day. All rights reserved.
// Journey graph: a day's movements as a dependency chain with slack, plus the disruption entry
// point (D19). Rendered as SVG: nodes in a row per day, edges carry slack minutes; thin slack
// turns the edge amber, a "risk" node red. Kind colors use the validated categorical palette
// (docs/engineering/dataviz-palette.md) with a legend so identity is never color-alone. Live
// (slice 050) once the organization has a trip: the chain comes from the itinerary (the events
// of the chosen day in start order, cancelled ones left out; slack is the gap between one event's
// end and the next one's start), the day is today's in the trip's zone or `?day=`, and two cards
// read off the tight connections and the leaders' pending proposals. The fixture otherwise.

import { useQuery } from '@tanstack/react-query';
import type { ItineraryProposal, Organization, Trip } from '@voysemble/contracts';
import { useState } from 'react';
import { Icons } from '../../app/shell/icons';
import type { ItineraryDay, ItineraryEvent } from '../../fixtures/itinerary';
import {
  type GraphEdge,
  type GraphNode,
  graphEdges,
  graphNodes,
  type NodeKind,
} from '../../fixtures/sections';
import { errorText } from '../../lib/errors';
import { itineraryApi, proposalsApi } from '../../lib/itinerary-api';
import { orgsQuery, pickActiveOrg, tripsQuery } from '../../lib/session';
import { strings } from '../../lib/strings';
import { Card, SectionPage } from './SectionPage';

const s = strings.journey;

export const KIND_COLOR: Record<NodeKind, string> = {
  flight: 'var(--vy-cat-1)',
  meal: 'var(--vy-cat-2)',
  activity: 'var(--vy-cat-3)',
  hotel: 'var(--vy-cat-4)',
  bus: 'var(--vy-cat-5)',
  meeting: 'var(--vy-cat-6)',
};

const X0 = 40;
const STEP = 118;
const Y = 90;

/** Slack at or under this many minutes is a risk; under twice it is tight. */
export const RISK_SLACK_MIN = 10;
export const TIGHT_SLACK_MIN = 20;

export function layout(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const m = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => {
    m.set(n.id, { x: X0 + i * STEP, y: Y });
  });
  return m;
}

const minutesOf = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Today's calendar date in a zone, YYYY-MM-DD. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** The chosen day, else today when the trip is on, else the first day with events, else the first day. */
export function pickDayDate(
  days: ItineraryDay[],
  events: ItineraryEvent[],
  picked: string | null,
  today: string,
): string | null {
  if (picked && days.some((d) => d.date === picked)) return picked;
  if (days.some((d) => d.date === today)) return today;
  const withEvents = days.find((d) => events.some((e) => e.date === d.date));
  return withEvents?.date ?? days[0]?.date ?? null;
}

/**
 * A day's chain: the events in start order (cancelled ones left out) as nodes, an edge between
 * neighbours carrying the slack from one's end (or start, when open-ended) to the next one's
 * start, never below zero. A done event is done, a running one is now, the rest next; a next
 * node reached over a risky edge is at risk.
 */
export function graphOfDay(
  events: ItineraryEvent[],
  date: string,
  dayNumber: number,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const ordered = events
    .filter((e) => e.date === date && e.status !== 'cancelled' && e.kind !== 'free')
    .sort((a, b) => minutesOf(a.start) - minutesOf(b.start) || a.order - b.order);
  const nodes: GraphNode[] = ordered.map((e) => ({
    id: e.id,
    kind: e.kind as NodeKind,
    title: e.title,
    day: dayNumber,
    time: e.start,
    status: e.status === 'done' ? 'done' : e.status === 'in_progress' ? 'now' : 'next',
  }));
  const edges: GraphEdge[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const next = ordered[i];
    if (!prev || !next) continue;
    const slackMin = Math.max(0, minutesOf(next.start) - minutesOf(prev.end ?? prev.start));
    edges.push({ from: prev.id, to: next.id, slackMin });
    const target = nodes[i];
    if (slackMin <= RISK_SLACK_MIN && target && target.status === 'next') target.status = 'risk';
  }
  return { nodes, edges };
}

export function JourneyGraphPage() {
  const orgs = useQuery(orgsQuery);
  const org = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(org?.id ?? ''), enabled: Boolean(org) });
  const trip = trips.data?.[0] ?? null;
  if (org && trip) return <LiveJourney org={org} trip={trip} />;
  return <FixtureJourney />;
}

function LiveJourney({ org, trip }: { org: Organization; trip: Trip }) {
  const itinerary = useQuery({
    queryKey: ['orgs', org.id, 'trips', trip.id, 'itinerary', 'graph'],
    queryFn: () => itineraryApi.get(org.id, trip.id),
  });
  const proposals = useQuery({
    queryKey: ['orgs', org.id, 'trips', trip.id, 'itinerary', 'proposals'],
    queryFn: () => proposalsApi.list(org.id, trip.id),
  });
  const [picked, setPicked] = useState<string | null>(() =>
    new URLSearchParams(location.search).get('day'),
  );
  const days = itinerary.data?.days ?? [];
  const events = itinerary.data?.events ?? [];
  const date = pickDayDate(days, events, picked, todayIn(trip.timezone));
  const dayIndex = days.findIndex((d) => d.date === date);
  const day = dayIndex >= 0 ? days[dayIndex] : null;
  const { nodes, edges } = date ? graphOfDay(events, date, dayIndex + 1) : { nodes: [], edges: [] };
  const tight = edges.filter((e) => e.slackMin <= TIGHT_SLACK_MIN);
  const risky = edges.filter((e) => e.slackMin <= RISK_SLACK_MIN).length;
  const pending = (proposals.data ?? []).filter((p) => p.status === 'pending');
  const eventById = new Map(events.map((e) => [e.id, e]));
  /** "10:00 Breakfast": where the slack starts (the event's end, or its start when open-ended). */
  const fromLabel = (id: string) => {
    const e = eventById.get(id);
    return `${e?.end ?? e?.start ?? ''} ${e?.title ?? ''}`;
  };
  const toLabel = (id: string) => {
    const e = eventById.get(id);
    return `${e?.start ?? ''} ${e?.title ?? ''}`;
  };
  return (
    <SectionPage
      title={strings.nav.journeyGraph}
      subtitle={
        itinerary.data && day
          ? s.liveSubtitle(nodes.length, risky, day.label || `${dayIndex + 1}`)
          : ''
      }
      sample={false}
      actions={<span className="chip chip--active">{strings.dashboard.live}</span>}
    >
      <Card
        title={day ? dayTitle(day.label, dayIndex + 1, day.date) : s.today}
        id="jg-today"
        action={
          days.length > 1 ? (
            <nav className="chips" aria-label={s.pickDay}>
              {days.map((d, i) => (
                <button
                  key={d.date}
                  type="button"
                  className={`chip chip--filter${d.date === date ? ' chip--on' : ''}`}
                  aria-pressed={d.date === date}
                  onClick={() => setPicked(d.date)}
                >
                  {s.dayChip(i + 1)}
                </button>
              ))}
            </nav>
          ) : undefined
        }
      >
        {itinerary.isPending ? (
          <p className="muted small" role="status">
            {strings.settings.loading}
          </p>
        ) : itinerary.isError ? (
          <p className="muted small" role="status">
            {errorText(itinerary.error, s.loadFailed)}
          </p>
        ) : nodes.length === 0 ? (
          <p className="muted small" data-testid="jg-empty">
            {s.noEvents}
          </p>
        ) : (
          <GraphSvg nodes={nodes} edges={edges} />
        )}
        <Legend />
      </Card>
      <div className="grid">
        <Card title={s.tight} id="jg-tight">
          {tight.length === 0 ? (
            <p className="muted small">{s.tightNone}</p>
          ) : (
            <ol className="list list--plain" data-testid="tight">
              {tight.map((e) => (
                <li key={`${e.from}-${e.to}`}>
                  <strong>{e.slackMin <= RISK_SLACK_MIN ? s.status.risk : s.tightLabel}</strong>{' '}
                  {s.tightLine(fromLabel(e.from), toLabel(e.to), e.slackMin)}
                </li>
              ))}
            </ol>
          )}
          <p className="muted small">{s.tightRule}</p>
        </Card>
        <Card title={s.proposals} id="jg-proposals">
          {proposals.isPending ? (
            <p className="muted small" role="status">
              {strings.settings.loading}
            </p>
          ) : pending.length === 0 ? (
            <p className="muted small">{s.proposalsNone}</p>
          ) : (
            <ul className="list" data-testid="pending-proposals">
              {pending.slice(0, 5).map((p) => (
                <li key={p.id} className="proposal">
                  <strong>{proposalTitle(p)}</strong>
                  <span className="muted small">{p.note}</span>
                </li>
              ))}
            </ul>
          )}
          <a className="btn btn--ghost btn--sm" href="/itinerary">
            {s.openItinerary(pending.length)}
          </a>
        </Card>
      </div>
    </SectionPage>
  );
}

/** "Arrival · Day 1 · 2026-12-28", or "Day 1 · 2026-12-28" when the label is the default. */
function dayTitle(label: string, day: number, date: string): string {
  const plain = !label || label === `Day ${day}` || label === `${day}일차`;
  return plain ? s.liveDayPlain(day, date) : s.liveDay(label, day, date);
}

/** "Kim Daeun: remove Breakfast" / "Kim Daeun: change Lunch" / "Kim Daeun: add Gelato". */
function proposalTitle(p: ItineraryProposal): string {
  const what =
    p.kind === 'remove' ? s.proposalRemove : p.kind === 'add' ? s.proposalAdd : s.proposalChange;
  const title = p.eventTitle ?? (p.patch as { title?: string }).title ?? '';
  return `${p.proposedByName}: ${what} ${title}`.trim();
}

function GraphSvg({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const pos = layout(nodes);
  const width = X0 + nodes.length * STEP + 20;
  return (
    <div className="graphwrap">
      <svg
        className="graph"
        viewBox={`0 0 ${width} 180`}
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label={s.graphLabel(nodes.length)}
      >
        <title>{s.graphLabel(nodes.length)}</title>
        {edges.map((e) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const tone =
            e.slackMin <= RISK_SLACK_MIN ? 'risk' : e.slackMin <= TIGHT_SLACK_MIN ? 'tight' : 'ok';
          return (
            <g key={`${e.from}-${e.to}`} className={`graph__edge graph__edge--${tone}`}>
              <line x1={a.x + 22} y1={a.y} x2={b.x - 22} y2={b.y} />
              <text x={(a.x + b.x) / 2} y={a.y - 30} textAnchor="middle">
                {s.slack(e.slackMin)}
              </text>
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          return (
            <g
              key={n.id}
              className={`graph__node graph__node--${n.status}`}
              data-testid={`node-${n.id}`}
              data-status={n.status}
            >
              <circle cx={p.x} cy={p.y} r="20" fill={KIND_COLOR[n.kind]} />
              <circle cx={p.x} cy={p.y} r="24" className="graph__ring" />
              <text x={p.x} y={p.y + 44} textAnchor="middle" className="graph__time">
                {n.time}
              </text>
              <text x={p.x} y={p.y + 60} textAnchor="middle" className="graph__title">
                {n.title.length > 16 ? `${n.title.slice(0, 15)}…` : n.title}
              </text>
              <title>
                {n.time} {n.title} ({strings.kind[n.kind]}, {s.status[n.status]})
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Legend() {
  return (
    <ul className="legend" aria-label={s.legend}>
      {(Object.keys(KIND_COLOR) as NodeKind[]).map((k) => (
        <li key={k}>
          <span className="dot" style={{ background: KIND_COLOR[k] }} aria-hidden="true" />
          {strings.kind[k]}
        </li>
      ))}
      <li>
        <span className="dot dot--ringnow" aria-hidden="true" /> {s.status.now}
      </li>
      <li>
        <span className="dot dot--ringrisk" aria-hidden="true" /> {s.status.risk}
      </li>
    </ul>
  );
}

/** The sample page (slice 008): the fixture's concert day with its propagation story. */
function FixtureJourney() {
  const today = graphNodes.filter((n) => n.day === 4);
  const risky = graphEdges.filter((e) => e.slackMin <= RISK_SLACK_MIN).length;
  return (
    <SectionPage
      title={strings.nav.journeyGraph}
      subtitle={s.subtitle(today.length, risky)}
      actions={
        <button type="button" className="btn btn--ghost btn--sm">
          <Icons.alert /> {s.disruption}
        </button>
      }
    >
      <Card title={s.today} id="jg-today">
        <GraphSvg nodes={today} edges={graphEdges} />
        <Legend />
      </Card>
      <div className="grid">
        <Card title={s.propagation} id="jg-prop">
          <p>{s.propagationBody}</p>
          <ol className="list list--plain" data-testid="propagation">
            <li>
              <strong>10:45</strong> {s.prop1}
            </li>
            <li>
              <strong>12:30 → 12:55</strong> {s.prop2}
            </li>
            <li>
              <strong>14:00</strong> {s.prop3}
            </li>
          </ol>
        </Card>
        <Card title={s.proposals} id="jg-proposals">
          <ul className="list">
            <li className="proposal">
              <strong>{s.proposal1Title}</strong>
              <span className="muted small">{s.proposal1Body}</span>
              <span className="small">
                <button type="button" className="linkbtn">
                  {s.accept}
                </button>
                {' · '}
                <button type="button" className="linkbtn">
                  {s.reject}
                </button>
              </span>
            </li>
          </ul>
        </Card>
      </div>
    </SectionPage>
  );
}
