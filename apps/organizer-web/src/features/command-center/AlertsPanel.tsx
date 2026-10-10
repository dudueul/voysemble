// Copyright 2026- At Day. All rights reserved.
// Red/amber pinned first with suggested actions (doc 00 §8). Severity shown by word + icon, not color alone.

import { Icons } from '../../app/shell/icons';
import type { Alert } from '../../fixtures/korea-concert-tour';
import { relativeTo } from '../../lib/format';
import { strings } from '../../lib/strings';

const ORDER: Record<Alert['severity'], number> = { red: 0, amber: 1, info: 2 };

export function AlertsPanel({ alerts, now }: { alerts: Alert[]; now: string; timeZone: string }) {
  const sorted = [...alerts].sort(
    (a, b) => ORDER[a.severity] - ORDER[b.severity] || b.at.localeCompare(a.at),
  );
  return (
    <section className="card" aria-labelledby="alerts-title">
      <div className="card__head">
        <h2 className="card__title" id="alerts-title">
          {strings.dashboard.alerts}
        </h2>
        <button type="button" className="link">
          {strings.dashboard.viewAll}
          <Icons.arrow width="16" height="16" />
        </button>
      </div>
      <div className="card__body">
        {sorted.length === 0 ? (
          <p className="state__body">{strings.dashboard.noAlerts}</p>
        ) : (
          sorted.map((a) => (
            <article
              key={a.id}
              className={`alert alert--${a.severity}`}
              aria-label={`${strings.severity[a.severity]}: ${a.title}`}
            >
              <span className="alert__icon">
                {a.severity === 'info' ? <Icons.info /> : <Icons.alert />}
              </span>
              <div>
                <div className="alert__title">
                  <span className="alert__sev">{strings.severity[a.severity]}</span>
                  <span>{a.title}</span>
                  <span className="alert__time">{relativeTo(now, a.at)}</span>
                </div>
                <p className="alert__detail">{a.detail}</p>
                <div className="alert__actions">
                  {a.actions.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      className={`btn btn--sm ${i === 0 ? 'btn--primary' : 'btn--ghost'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
