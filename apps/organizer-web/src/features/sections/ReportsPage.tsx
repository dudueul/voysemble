// Copyright 2026- At Day. All rights reserved.
// Reports: trip-so-far KPI row, ack rate per day (column), head-count close time per day (line),
// document completion. Every chart has a hover layer and a table view; one series each, so no
// legend box (dataviz skill).

import { Icons } from '../../app/shell/icons';
import { dayMetrics, documents } from '../../fixtures/sections';
import { strings } from '../../lib/strings';
import { BarChart, DataTable, LineChart } from './charts';
import { Card, SectionPage } from './SectionPage';

const s = strings.reports;

export function ReportsPage() {
  const ack = dayMetrics.map((d) => ({ label: `D${d.day}`, value: d.ackRate }));
  const close = dayMetrics.map((d) => ({ label: `D${d.day}`, value: d.headcountCloseMin }));
  const avgAck = Math.round(ack.reduce((n, p) => n + p.value, 0) / ack.length);
  const lastClose = close.at(-1)?.value ?? 0;
  const docsPct = Math.round(
    (documents.filter((d) => d.required).reduce((n, d) => n + d.collected, 0) /
      documents.filter((d) => d.required).reduce((n, d) => n + d.total, 0)) *
      100,
  );
  const tiles = [
    { label: s.avgAck, value: `${avgAck}%`, icon: <Icons.check />, tone: 'ok' },
    { label: s.lastClose, value: `${lastClose} min`, icon: <Icons.people />, tone: 'brand' },
    { label: s.docs, value: `${docsPct}%`, icon: <Icons.checklist />, tone: 'accent' },
    {
      label: s.announcements,
      value: String(dayMetrics.reduce((n, d) => n + d.announcements, 0)),
      icon: <Icons.bell />,
      tone: 'brand',
    },
  ] as const;
  return (
    <SectionPage
      title={strings.nav.reports}
      subtitle={s.subtitle}
      actions={
        <button type="button" className="btn btn--ghost btn--sm">
          {s.exportCsv}
        </button>
      }
    >
      <section className="stats" aria-label={s.kpis}>
        {tiles.map((t) => (
          <div key={t.label} className="card stat">
            <span className={`stat__icon stat__icon--${t.tone}`}>{t.icon}</span>
            <div>
              <div className="stat__value" data-testid={`kpi-${t.label}`}>
                {t.value}
              </div>
              <div className="stat__label">{t.label}</div>
            </div>
          </div>
        ))}
      </section>
      <div className="grid grid--even">
        <Card title={s.ackByDay} id="rep-ack">
          <BarChart data={ack} unit="%" max={100} label={s.ackByDayLabel} />
          <DataTable caption={s.tableView} data={ack} unit="%" />
        </Card>
        <Card title={s.closeByDay} id="rep-close">
          <LineChart data={close} unit=" min" label={s.closeByDayLabel} />
          <DataTable caption={s.tableView} data={close} unit=" min" />
        </Card>
      </div>
      <Card title={s.retention} id="rep-retention">
        <p>{s.retentionBody}</p>
      </Card>
    </SectionPage>
  );
}
