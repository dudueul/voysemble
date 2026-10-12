// Copyright 2026- At Day. All rights reserved.
// Notifications (D29, slice 052): the organizer's log of what the lanes sent for the active trip.
// One row per event: when, what, how many went in the priority, normal and digest lanes, how
// many normal-lane notifications still wait for quiet hours to end and how many digest rows the
// digest email carried (slice 054). The rules themselves (which
// role gets which lane, the quiet hours and the digest hour) are set on the Settings page and
// explained here. Live once the organization has a trip; a sample otherwise.

import { useQuery } from '@tanstack/react-query';
import type { NotificationEvent, Organization, Trip } from '@voysemble/contracts';
import { Icons } from '../../app/shell/icons';
import { errorText } from '../../lib/errors';
import { formatTime } from '../../lib/format';
import { notificationLogQuery, orgsQuery, pickActiveOrg, tripsQuery } from '../../lib/session';
import { strings } from '../../lib/strings';
import { Card, SectionPage } from '../sections/SectionPage';

const s = strings.notifications;

const SAMPLE: NotificationEvent[] = [
  {
    createdAt: '2026-12-31T05:31:00.000Z',
    kind: 'announcement',
    title: 'Breakfast moved to 06:30',
    refType: 'announcement',
    refId: 'sample-1',
    lanes: { priority: 38, normal: 6, digest: 0 },
    held: 0,
    emailed: 0,
    recipients: 44,
  },
  {
    createdAt: '2026-12-31T05:50:00.000Z',
    kind: 'headcount_call',
    title: 'Head count: Bus A',
    refType: 'headcount',
    refId: 'sample-2',
    lanes: { priority: 20, normal: 0, digest: 0 },
    held: 0,
    emailed: 0,
    recipients: 20,
  },
  {
    createdAt: '2026-12-30T22:10:00.000Z',
    kind: 'itinerary_revision',
    title: 'Itinerary updated',
    refType: 'announcement',
    refId: 'sample-3',
    lanes: { priority: 0, normal: 40, digest: 24 },
    held: 40,
    emailed: 24,
    recipients: 64,
  },
];

export function NotificationsPage() {
  const orgs = useQuery(orgsQuery);
  const org = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(org?.id ?? ''), enabled: Boolean(org) });
  const trip = trips.data?.[0] ?? null;
  if (org && trip) return <LiveNotifications org={org} trip={trip} />;
  return (
    <SectionPage title={s.title} subtitle={s.subtitle}>
      <LogCard events={SAMPLE} timeZone="Europe/Rome" />
    </SectionPage>
  );
}

function LiveNotifications({ org, trip }: { org: Organization; trip: Trip }) {
  const log = useQuery(notificationLogQuery(org.id, trip.id));
  return (
    <SectionPage
      title={s.title}
      subtitle={log.data ? s.liveSubtitle(log.data.events.length) : ''}
      sample={false}
      actions={<span className="chip chip--active">{strings.dashboard.live}</span>}
    >
      {log.isPending ? (
        <p className="muted small" role="status">
          {strings.settings.loading}
        </p>
      ) : log.isError ? (
        <p className="muted small" role="status">
          {errorText(log.error, s.loadFailed)}
        </p>
      ) : (
        <LogCard events={log.data.events} timeZone={trip.timezone} />
      )}
    </SectionPage>
  );
}

function LogCard({ events, timeZone }: { events: NotificationEvent[]; timeZone: string }) {
  return (
    <Card title={s.log} id="notif-log">
      <p className="muted small">{s.lanesRule}</p>
      {events.length === 0 ? (
        <p className="muted small" data-testid="notif-empty">
          {s.none}
        </p>
      ) : (
        <table className="table" data-testid="notif-log">
          <thead>
            <tr>
              <th>{s.colWhen}</th>
              <th>{s.colWhat}</th>
              <th>{s.colPriority}</th>
              <th>{s.colNormal}</th>
              <th>{s.colDigest}</th>
              <th>{s.colHeld}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={`${e.createdAt}-${e.refId}`} data-testid={`notif-${e.refId}`}>
                <td className="muted">
                  {e.createdAt.slice(0, 10)} {formatTime(e.createdAt, timeZone)}
                </td>
                <td>
                  <strong>{e.title}</strong>
                  <span className="muted small"> · {s.kind[e.kind]}</span>
                </td>
                <td>{e.lanes.priority}</td>
                <td>{e.lanes.normal}</td>
                <td>
                  {e.lanes.digest}
                  {e.emailed > 0 ? (
                    <span className="muted small"> · {s.emailedCount(e.emailed)}</span>
                  ) : null}
                </td>
                <td>
                  {e.held > 0 ? (
                    <span className="chip chip--delayed">{s.heldCount(e.held)}</span>
                  ) : (
                    <span className="muted">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">{s.digestNote}</p>
      <p className="muted small">
        <Icons.bell /> {s.pushNote}
      </p>
    </Card>
  );
}
