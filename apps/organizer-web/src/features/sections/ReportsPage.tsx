// Copyright 2026- At Day. All rights reserved.
// Reports: trip-so-far KPI row, ack rate per day (column), head-count close time per day (line),
// a CSV export. Live (slice 034) with an organization and a trip: the server's trip report from
// acks, head counts, incidents and the fee ledger; the fixture otherwise. Every chart has a
// hover layer and a table view; one series each, so no legend box (dataviz skill).

import { useQuery } from '@tanstack/react-query';
import type { TripReport } from '@voysemble/contracts';
import { Icons } from '../../app/shell/icons';
import { dayMetrics, documents } from '../../fixtures/sections';
import { ApiError } from '../../lib/api-client';
import {
  orgsQuery,
  pickActiveOrg,
  reportQuery,
  tripsQuery,
  useActiveTrip,
} from '../../lib/session';
import { strings } from '../../lib/strings';
import { BarChart, DataTable, LineChart, type Point } from './charts';
import { Card, SectionPage } from './SectionPage';

const s = strings.reports;

type Tile = { label: string; value: string; icon: React.ReactNode; tone: string };

/** The CSV the export button hands over: one line per trip day with a fact. */
export function reportCsv(byDay: TripReport['byDay']): string {
  const lines = byDay.map((d) =>
    [
      d.day,
      d.date,
      d.announcementsSent,
      d.ackRate ?? '',
      d.headcounts,
      d.avgCloseMinutes ?? '',
      d.missing,
    ].join(','),
  );
  return `${[s.csvHeader, ...lines].join('\n')}\n`;
}

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Body({
  tiles,
  ack,
  close,
  subtitle,
  live,
  csv,
  note,
}: {
  tiles: readonly Tile[];
  ack: Point[];
  close: Point[];
  subtitle: string;
  live: boolean;
  csv: string;
  note?: React.ReactNode;
}) {
  return (
    <SectionPage
      title={strings.nav.reports}
      subtitle={subtitle}
      actions={
        <span className="window-actions">
          {live ? <span className="chip chip--active">{strings.dashboard.live}</span> : null}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => download('voysemble-report.csv', csv)}
          >
            {s.exportCsv}
          </button>
        </span>
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
      {note}
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

function FixtureReport() {
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
  const csv = reportCsv(
    dayMetrics.map((d) => ({
      day: d.day,
      date: d.date,
      announcementsSent: d.announcements,
      ackRate: d.ackRate,
      headcounts: 1,
      avgCloseMinutes: d.headcountCloseMin,
      missing: 0,
    })),
  );
  return (
    <Body tiles={tiles} ack={ack} close={close} subtitle={s.subtitle} live={false} csv={csv} />
  );
}

function LiveReport({ orgId, tripId }: { orgId: string; tripId: string }) {
  const q = useQuery(reportQuery(orgId, tripId));
  const r = q.data;
  const pct = (n: number | null) => (n === null ? s.none : `${Math.round(n)}%`);
  const min = (n: number | null) => (n === null ? s.none : `${Math.round(n)} min`);
  const tiles: Tile[] = [
    {
      label: s.avgAck,
      value: r ? pct(r.announcements.avgAckRate) : s.none,
      icon: <Icons.check />,
      tone: 'ok',
    },
    {
      label: s.lastClose,
      value: r ? min(r.headcounts.lastCloseMinutes) : s.none,
      icon: <Icons.people />,
      tone: 'brand',
    },
    {
      label: s.openIncidents,
      value: r ? String(r.incidents.open) : s.none,
      icon: <Icons.alert />,
      tone: 'accent',
    },
    {
      label: s.feesCollected,
      value: r?.fees ? pct(r.fees.collectedPct) : s.none,
      icon: <Icons.card />,
      tone: 'brand',
    },
    // Slice 045: completion over the required documents; "no requirements yet" until one exists.
    {
      label: s.docs,
      value: r?.documents ? pct(r.documents.completionPct) : s.docsNone,
      icon: <Icons.checklist />,
      tone: 'accent',
    },
  ];
  const ack = (r?.byDay ?? []).map((d) => ({ label: `D${d.day}`, value: d.ackRate ?? 0 }));
  const close = (r?.byDay ?? []).map((d) => ({
    label: `D${d.day}`,
    value: d.avgCloseMinutes ?? 0,
  }));
  const note = q.isPending ? (
    <p className="state__body" role="status">
      {strings.states.loading}
    </p>
  ) : q.isError ? (
    <p className="field__error" role="alert">
      {s.loadFailed}{' '}
      {q.error instanceof ApiError ? `(${strings.auth.reference(q.error.correlationId)})` : ''}
    </p>
  ) : r && r.byDay.length === 0 ? (
    <p className="state__body" role="status" data-testid="report-empty">
      {s.noData}
    </p>
  ) : null;
  return (
    <Body
      tiles={tiles}
      ack={ack}
      close={close}
      subtitle={s.liveSubtitle}
      live
      csv={reportCsv(r?.byDay ?? [])}
      note={note}
    />
  );
}

export function ReportsPage() {
  const orgs = useQuery(orgsQuery);
  const org = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(org?.id ?? ''), enabled: Boolean(org) });
  const trip = useActiveTrip(org?.id ?? '', trips.data);
  if (org && trip) return <LiveReport orgId={org.id} tripId={trip.id} />;
  return <FixtureReport />;
}
