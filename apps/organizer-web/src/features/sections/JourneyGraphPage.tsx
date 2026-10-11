// Copyright 2026- At Day. All rights reserved.
// Journey graph: today's movements as a dependency chain with slack, plus the disruption entry
// point (D19). Rendered as SVG: nodes in a row per day, edges carry slack minutes; thin slack
// turns the edge amber, a "risk" node red. Kind colors use the validated categorical palette
// (docs/engineering/dataviz-palette.md) with a legend so identity is never color-alone.

import { Icons } from '../../app/shell/icons';
import { type GraphNode, graphEdges, graphNodes, type NodeKind } from '../../fixtures/sections';
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

export function layout(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const m = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => {
    m.set(n.id, { x: X0 + i * STEP, y: Y });
  });
  return m;
}

export function JourneyGraphPage() {
  const today = graphNodes.filter((n) => n.day === 4);
  const pos = layout(today);
  const width = X0 + today.length * STEP + 20;
  const risky = graphEdges.filter((e) => e.slackMin <= 10).length;
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
        <div className="graphwrap">
          <svg
            className="graph"
            viewBox={`0 0 ${width} 180`}
            preserveAspectRatio="xMinYMid meet"
            role="img"
            aria-label={s.graphLabel(today.length)}
          >
            <title>{s.graphLabel(today.length)}</title>
            {graphEdges.map((e) => {
              const a = pos.get(e.from);
              const b = pos.get(e.to);
              if (!a || !b) return null;
              const tone = e.slackMin <= 10 ? 'risk' : e.slackMin <= 20 ? 'tight' : 'ok';
              return (
                <g key={`${e.from}-${e.to}`} className={`graph__edge graph__edge--${tone}`}>
                  <line x1={a.x + 22} y1={a.y} x2={b.x - 22} y2={b.y} />
                  <text x={(a.x + b.x) / 2} y={a.y - 30} textAnchor="middle">
                    {s.slack(e.slackMin)}
                  </text>
                </g>
              );
            })}
            {today.map((n) => {
              const p = pos.get(n.id);
              if (!p) return null;
              return (
                <g
                  key={n.id}
                  className={`graph__node graph__node--${n.status}`}
                  data-testid={`node-${n.id}`}
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
