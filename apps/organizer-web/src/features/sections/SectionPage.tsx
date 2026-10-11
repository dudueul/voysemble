// Copyright 2026- At Day. All rights reserved.
// Shared frame for the sample section pages: title, subtitle, the "Sample data" chip that every
// fixture-backed page must show, and small presentational helpers reused across sections.

import type { ReactNode } from 'react';
import { strings } from '../../lib/strings';

export function SectionPage({
  title,
  subtitle,
  actions,
  children,
  className,
  sample = true,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** False once the page's main content comes from the API; cards on fixtures show their own chip. */
  sample?: boolean;
}) {
  return (
    <main className={`page${className ? ` ${className}` : ''}`}>
      <header className="page__header">
        <div>
          <h1 className="page__title">{title}</h1>
          {subtitle ? <p className="page__subtitle">{subtitle}</p> : null}
        </div>
        <div className="page__meta">
          {sample ? <span className="chip chip--sample">{strings.dashboard.simulated}</span> : null}
          {actions}
        </div>
      </header>
      {children}
    </main>
  );
}

export function Card({
  title,
  id,
  action,
  children,
  className,
}: {
  title: string;
  id: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`} aria-labelledby={id}>
      <div className="card__head">
        <h2 className="card__title" id={id}>
          {title}
        </h2>
        {action}
      </div>
      <div className="card__body">{children}</div>
    </section>
  );
}

/** Same-ramp meter: fill carries state, the track is a lighter step (dataviz "meter"). */
export function Meter({
  value,
  max,
  tone = 'brand',
  label,
}: {
  value: number;
  max: number;
  tone?: 'brand' | 'ok' | 'warn' | 'danger';
  label: string;
}) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className={`meter meter--${tone}`} role="img" aria-label={label}>
      <div className="meter__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Initials({ name, hue }: { name: string; hue?: number }) {
  const initials = name
    .split(' ')
    .map((s) => s[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const h = hue ?? [...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className="initials"
      aria-hidden="true"
      style={{ background: `hsl(${h} 60% 90%)`, color: `hsl(${h} 50% 30%)` }}
    >
      {initials}
    </span>
  );
}

export function formatKrw(n: number): string {
  return `₩${n.toLocaleString('en-US')}`;
}
