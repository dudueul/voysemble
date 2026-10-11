// Copyright 2026- At Day. All rights reserved.
// Four stat tiles. Values derive from the dashboard; the component never computes business rules.

import { Icons } from '../../app/shell/icons';
import type { Dashboard } from '../../fixtures/korea-concert-tour';
import { strings } from '../../lib/strings';

export function StatTiles({ data }: { data: Dashboard }) {
  const activeTrips = data.trips.filter((t) => t.status === 'active').length;
  // Travelers of the selected trip: a trip in planning still has a roster worth seeing.
  const travelers =
    data.trips.find((t) => t.id === data.activeTripId)?.travelerCount ??
    data.trips.filter((t) => t.status === 'active').reduce((n, t) => n + t.travelerCount, 0);
  const ackTotal = data.announcements.reduce((n, a) => n + a.total, 0);
  const ackDone = data.announcements.reduce((n, a) => n + a.acknowledged, 0);
  const ackRate = ackTotal === 0 ? 0 : Math.round((ackDone / ackTotal) * 100);
  const openAlerts = data.alerts.filter((a) => a.severity !== 'info').length;

  const tiles = [
    {
      label: strings.dashboard.activeTrips,
      value: String(activeTrips),
      icon: <Icons.plane />,
      tone: 'brand',
    },
    {
      label: strings.dashboard.travelers,
      value: String(travelers),
      icon: <Icons.people />,
      tone: 'accent',
    },
    {
      label: strings.dashboard.ackRate,
      value: ackTotal === 0 ? strings.dashboard.noAckYet : `${ackRate}%`,
      icon: <Icons.check />,
      tone: 'ok',
    },
    {
      label: strings.dashboard.openAlerts,
      value: String(openAlerts),
      icon: <Icons.alert />,
      tone: 'danger',
    },
  ] as const;

  return (
    <section className="stats" aria-label="Summary">
      {tiles.map((t) => (
        <div key={t.label} className="card stat">
          <span className={`stat__icon stat__icon--${t.tone}`}>{t.icon}</span>
          <div>
            <div className="stat__value" data-testid={`stat-${t.label}`}>
              {t.value}
            </div>
            <div className="stat__label">{t.label}</div>
          </div>
        </div>
      ))}
    </section>
  );
}
