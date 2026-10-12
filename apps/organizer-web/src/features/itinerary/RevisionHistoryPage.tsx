// Copyright 2026- At Day. All rights reserved.
// Revision history (D19, slice 057): every publish kept as it went out. One card per revision,
// newest first: who, when, the counts against the one before and the change lines the revision
// announcement carried; a fold loads the snapshot (the events exactly as travelers saw them) by
// day. Read-only: the editor is where the next revision is made. A sample without a trip.

import { useQuery } from '@tanstack/react-query';
import type { ItineraryRevision, Organization, Trip } from '@voysemble/contracts';
import { useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { errorText } from '../../lib/errors';
import { formatTime } from '../../lib/format';
import { changeLines, itineraryApi } from '../../lib/itinerary-api';
import { orgsQuery, pickActiveOrg, tripsQuery, useActiveTrip } from '../../lib/session';
import { strings } from '../../lib/strings';
import { Card, SectionPage } from '../sections/SectionPage';

const s = strings.itinerary;

/** What a snapshot row needs to be listed; the contract's event carries more. */
type SnapshotEvent = { date: string; start: string; title: string; place: string; status: string };
/** Loads a revision's snapshot; the sample has none to load. */
type SnapshotLoader = (revision: number) => Promise<{ snapshot: SnapshotEvent[] }>;

const SAMPLE: ItineraryRevision[] = [
  {
    revision: 2,
    publishedAt: '2026-12-30T21:05:00.000Z',
    publishedByName: 'Nate',
    events: 31,
    summary: {
      revision: 2,
      fromRevision: 1,
      added: 1,
      changed: 1,
      removed: 0,
      changes: [
        {
          kind: 'changed',
          eventId: 'ev_3',
          date: '2026-12-31',
          day: 4,
          title: 'Breakfast',
          start: '07:30',
          fields: ['start'],
          previousStart: '07:00',
        },
        {
          kind: 'added',
          eventId: 'ev_9',
          date: '2026-12-31',
          day: 4,
          title: 'Gelato on the way back',
          start: '16:15',
          fields: [],
          previousStart: null,
        },
      ],
    },
  },
  {
    revision: 1,
    publishedAt: '2026-12-20T09:00:00.000Z',
    publishedByName: 'Nate',
    events: 30,
    summary: { revision: 1, fromRevision: 0, added: 30, changed: 0, removed: 0, changes: [] },
  },
];

export function RevisionHistoryPage() {
  const orgs = useQuery(orgsQuery);
  const org = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(org?.id ?? ''), enabled: Boolean(org) });
  const trip = useActiveTrip(org?.id ?? '', trips.data);
  if (org && trip) return <LiveHistory org={org} trip={trip} />;
  return (
    <SectionPage title={s.historyTitle} subtitle={s.historySubtitle(SAMPLE.length)}>
      <HistoryList revisions={SAMPLE} timeZone="Europe/Rome" />
    </SectionPage>
  );
}

function LiveHistory({ org, trip }: { org: Organization; trip: Trip }) {
  const revisions = useQuery({
    queryKey: ['orgs', org.id, 'trips', trip.id, 'itinerary', 'revisions'],
    queryFn: () => itineraryApi.revisions(org.id, trip.id),
  });
  return (
    <SectionPage
      title={s.historyTitle}
      subtitle={revisions.data ? s.historySubtitle(revisions.data.length) : ''}
      sample={false}
      actions={<span className="chip chip--active">{strings.dashboard.live}</span>}
    >
      {revisions.isPending ? (
        <p className="muted small" role="status">
          {strings.settings.loading}
        </p>
      ) : revisions.isError ? (
        <p className="muted small" role="status">
          {errorText(revisions.error, s.historyFailed)}
        </p>
      ) : (
        <HistoryList
          revisions={revisions.data}
          timeZone={trip.timezone}
          load={(n) => itineraryApi.revision(org.id, trip.id, n)}
        />
      )}
    </SectionPage>
  );
}

function HistoryList({
  revisions,
  timeZone,
  load,
}: {
  revisions: ItineraryRevision[];
  timeZone: string;
  /** Loads a snapshot; the sample has none to load. */
  load?: SnapshotLoader;
}) {
  return (
    <>
      <p className="muted small">{s.historyIntro}</p>
      <p className="small">
        <a className="btn btn--secondary btn--sm" href="/itinerary">
          {s.backToEditor}
        </a>
      </p>
      {revisions.length === 0 ? (
        <Card title={s.historyTitle} id="history-empty">
          <p className="muted small" data-testid="history-empty">
            {s.historyNone}
          </p>
        </Card>
      ) : (
        <div data-testid="history-list">
          {revisions.map((r) => (
            <RevisionCard
              key={r.revision}
              revision={r}
              timeZone={timeZone}
              {...(load ? { load } : {})}
            />
          ))}
        </div>
      )}
    </>
  );
}

function RevisionCard({
  revision: r,
  timeZone,
  load,
}: {
  revision: ItineraryRevision;
  timeZone: string;
  load?: SnapshotLoader;
}) {
  const [open, setOpen] = useState(false);
  const snapshot = useQuery({
    queryKey: ['itinerary', 'revision-snapshot', r.revision, timeZone],
    queryFn: () => (load ? load(r.revision) : Promise.resolve({ snapshot: [] })),
    enabled: open && Boolean(load),
  });
  const when = `${r.publishedAt.slice(0, 10)} ${formatTime(r.publishedAt, timeZone)}`;
  return (
    <Card title={s.revisionLine(r.revision, when, r.publishedByName)} id={`revision-${r.revision}`}>
      <p className="small" data-testid={`revision-${r.revision}-counts`}>
        <strong>{s.revisionCounts(r.summary.added, r.summary.changed, r.summary.removed)}</strong>
        <span className="muted"> · {s.snapshotEvents(r.events)}</span>
      </p>
      {r.revision === 1 ? (
        <p className="muted small">{s.firstRevision}</p>
      ) : (
        <ul className="list list--plain small" data-testid={`revision-${r.revision}-changes`}>
          {changeLines(r.summary).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {load ? (
        <>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <Icons.itinerary width="16" height="16" /> {open ? s.hideSnapshot : s.showSnapshot}
          </button>
          {open ? (
            snapshot.isPending ? (
              <p className="muted small" role="status">
                {s.snapshotLoading}
              </p>
            ) : snapshot.isError ? (
              <p className="muted small" role="status">
                {errorText(snapshot.error, s.snapshotFailed)}
              </p>
            ) : (
              <ol
                className="list list--plain small"
                data-testid={`revision-${r.revision}-snapshot`}
              >
                {snapshot.data.snapshot.map((e) => (
                  <li key={`${e.date}-${e.start}-${e.title}`}>
                    {e.date} {e.start} · {e.title}
                    {e.place ? ` · ${e.place}` : ''}
                    {e.status !== 'scheduled'
                      ? ` · ${strings.status[e.status as keyof typeof strings.status] ?? e.status}`
                      : ''}
                  </li>
                ))}
              </ol>
            )
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
