// Copyright 2026- At Day. All rights reserved.
// Minimal SVG charts for the Reports page, following docs/engineering/dataviz-palette.md:
// bars <= 24px with a 4px rounded data-end and square baseline, 2px lines with >= 8px markers
// and a surface ring, hairline solid gridlines, text in text tokens (never the series color),
// a hover tooltip per mark, and a table view beside every chart. Single series: no legend box.

import { useState } from 'react';

export type Point = { label: string; value: number };

export function niceMax(values: number[]): number {
  const max = Math.max(0, ...values);
  if (max === 0) return 10;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = max / pow <= 2 ? 0.5 : max / pow <= 5 ? 1 : 2;
  return Math.ceil(max / (pow * step)) * pow * step;
}

const W = 420;
const H = 180;
const PAD = { l: 52, r: 32, t: 20, b: 28 };

function Tooltip({ x, y, text }: { x: number; y: number; text: string }) {
  const w = text.length * 6.4 + 16;
  const left = Math.min(Math.max(x - w / 2, 2), W - w - 2);
  return (
    <g className="chart__tip" transform={`translate(${left} ${Math.max(y - 34, 2)})`}>
      <rect width={w} height="24" rx="6" />
      <text x={w / 2} y="16" textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

export function BarChart({
  data,
  unit = '',
  label,
  max,
}: {
  data: Point[];
  unit?: string;
  label: string;
  max?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const top = max ?? niceMax(data.map((d) => d.value));
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const band = innerW / data.length;
  const bw = Math.min(24, band * 0.6);
  const y = (v: number) => PAD.t + innerH - (v / top) * innerH;
  const ticks = [0, top / 2, top];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <title>{label}</title>
      {ticks.map((t) => (
        <g key={t} className="chart__grid">
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
          <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end">
            {t}
            {unit}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = PAD.l + band * i + (band - bw) / 2;
        const h = y(0) - y(d.value);
        const r = Math.min(4, h);
        // Rounded top corners only; square at the baseline.
        const path = `M${x} ${y(0)} v${-(h - r)} a${r} ${r} 0 0 1 ${r} ${-r} h${bw - 2 * r} a${r} ${r} 0 0 1 ${r} ${r} v${h - r} z`;
        const last = i === data.length - 1;
        return (
          // biome-ignore lint/a11y/useSemanticElements: SVG has no button element; the group is the hover/focus target
          <g
            key={d.label}
            className={`chart__bar${hover === i ? ' chart__bar--hover' : ''}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            tabIndex={0}
            role="button"
            aria-label={`${d.label}: ${d.value}${unit}`}
          >
            <rect x={PAD.l + band * i} y={PAD.t} width={band} height={innerH} fill="transparent" />
            <path d={path} />
            {last ? (
              <text x={x + bw / 2} y={y(d.value) - 6} textAnchor="middle" className="chart__value">
                {d.value}
                {unit}
              </text>
            ) : null}
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="chart__axis">
              {d.label}
            </text>
          </g>
        );
      })}
      {hover !== null && data[hover] ? (
        <Tooltip
          x={PAD.l + band * hover + band / 2}
          y={y(data[hover].value)}
          text={`${data[hover].label}: ${data[hover].value}${unit}`}
        />
      ) : null}
    </svg>
  );
}

export function LineChart({
  data,
  unit = '',
  label,
}: {
  data: Point[];
  unit?: string;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const top = niceMax(data.map((d) => d.value));
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const x = (i: number) =>
    PAD.l + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => PAD.t + innerH - (v / top) * innerH;
  const d = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(p.value)}`).join(' ');
  const area = `${d} L${x(data.length - 1)} ${y(0)} L${x(0)} ${y(0)} z`;
  const ticks = [0, top / 2, top];
  const lastIdx = data.length - 1;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <title>{label}</title>
      {ticks.map((t) => (
        <g key={t} className="chart__grid">
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
          <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end">
            {t}
            {unit}
          </text>
        </g>
      ))}
      <path d={area} className="chart__area" />
      <path d={d} className="chart__line" />
      {data.map((p, i) => (
        // biome-ignore lint/a11y/useSemanticElements: SVG has no button element; the group is the hover/focus target
        <g
          key={p.label}
          className="chart__pt"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
          tabIndex={0}
          role="button"
          aria-label={`${p.label}: ${p.value}${unit}`}
        >
          <circle cx={x(i)} cy={y(p.value)} r="14" fill="transparent" />
          <circle cx={x(i)} cy={y(p.value)} r="5" className="chart__marker" />
          {i === lastIdx ? (
            <text x={x(i)} y={y(p.value) - 12} textAnchor="middle" className="chart__value">
              {p.value}
              {unit}
            </text>
          ) : null}
          <text x={x(i)} y={H - 8} textAnchor="middle" className="chart__axis">
            {p.label}
          </text>
        </g>
      ))}
      {hover !== null && data[hover] ? (
        <>
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} className="chart__crosshair" />
          <Tooltip
            x={x(hover)}
            y={y(data[hover].value)}
            text={`${data[hover].label}: ${data[hover].value}${unit}`}
          />
        </>
      ) : null}
    </svg>
  );
}

export function DataTable({
  caption,
  data,
  unit = '',
}: {
  caption: string;
  data: Point[];
  unit?: string;
}) {
  return (
    <details className="chart__table">
      <summary>{caption}</summary>
      <table className="table">
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>
                {d.value}
                {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
