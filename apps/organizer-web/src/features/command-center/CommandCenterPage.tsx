// Copyright 2026- At Day. All rights reserved.
// Route component: wires TanStack Query to the pure view. With an organization and a trip the
// dashboard is assembled from the API (slice 014); `?state=` still selects a fixture state so
// every UI state stays reachable, and without a trip the fixture is the sample.

import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../lib/api-client';
import { DashboardFetchError, type DashboardState, fetchDashboard } from '../../lib/dashboard-api';
import { fetchLiveDashboard } from '../../lib/live-dashboard';
import { meQuery, orgsQuery, pickActiveOrg, tripsQuery } from '../../lib/session';
import { CommandCenterView } from './CommandCenterView';

export function CommandCenterPage({ state }: { state: DashboardState }) {
  const me = useQuery(meQuery);
  const orgs = useQuery(orgsQuery);
  const org = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(org?.id ?? ''), enabled: Boolean(org) });
  const trip = trips.data?.[0] ?? null;
  const resolving = orgs.isPending || (org !== null && trips.isPending);
  const useLive = state === 'live' && org !== null && trip !== null;

  const fixture = useQuery({
    queryKey: ['dashboard', state],
    queryFn: () => fetchDashboard(state),
    retry: false,
    staleTime: 60_000,
    enabled: !useLive && !resolving,
  });
  const live = useQuery({
    queryKey: ['dashboard', 'live', org?.id ?? '', trip?.id ?? ''],
    queryFn: () =>
      fetchLiveDashboard(
        me.data ?? null,
        org as NonNullable<typeof org>,
        trips.data ?? [],
        (trip as NonNullable<typeof trip>).id,
      ),
    retry: false,
    staleTime: 15_000,
    enabled: useLive,
  });
  const q = useLive ? live : fixture;

  if (resolving || q.isPending) return <CommandCenterView state={{ kind: 'loading' }} />;
  if (q.isError) {
    const id =
      q.error instanceof DashboardFetchError || q.error instanceof ApiError
        ? q.error.correlationId
        : 'unknown';
    return (
      <CommandCenterView
        state={{ kind: 'error', correlationId: id, retry: () => void q.refetch() }}
      />
    );
  }
  return <CommandCenterView state={{ kind: 'ready', data: q.data }} />;
}
