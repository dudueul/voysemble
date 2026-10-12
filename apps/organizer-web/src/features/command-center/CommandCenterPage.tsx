// Copyright 2026- At Day. All rights reserved.
// Route component: wires TanStack Query to the pure view. With an organization and a trip the
// dashboard is assembled from the API (slice 014); `?state=` still selects a fixture state so
// every UI state stays reachable, and without a trip the fixture is the sample. Slice 063: the
// trip is the organizer's choice (`useActiveTrip`), the Trips panel switches and creates trips,
// and a lost connection is said: the last data under the banner when there is any, the offline
// state when the first load fails (the organizations or the trips list included).

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Dashboard } from '../../fixtures/korea-concert-tour';
import { ApiError } from '../../lib/api-client';
import { DashboardFetchError, type DashboardState, fetchDashboard } from '../../lib/dashboard-api';
import { fetchLiveDashboard } from '../../lib/live-dashboard';
import {
  meQuery,
  orgsQuery,
  pickActiveOrg,
  setup,
  tripsQuery,
  useActiveTrip,
  writeActiveTripId,
} from '../../lib/session';
import { type CommandCenterState, CommandCenterView } from './CommandCenterView';
import type { NewTripInput } from './TripsPanel';

/** What the page reads off a query to decide the view state; a plain shape so the rule is testable. */
export type QuerySnapshot = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: Dashboard | undefined;
  /** Epoch milliseconds of the data, the "last sync" when the refetch failed offline. */
  dataUpdatedAt: number;
};

function isOffline(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'NETWORK';
}

function referenceOf(e: unknown): string {
  return e instanceof DashboardFetchError || e instanceof ApiError ? e.correlationId : 'unknown';
}

/**
 * The view state from the queries. In live mode a failed organizations or trips read decides
 * first (offline without a connection, else the error with its reference). Then: loading while
 * resolving or pending; a network failure with data shows that data offline, dated by its fetch;
 * one without data is the offline state; any other failure the error state.
 */
export function commandCenterState(input: {
  live: boolean;
  resolving: boolean;
  contextError: unknown;
  query: QuerySnapshot;
  retry: () => void;
  now: string;
}): CommandCenterState {
  const { query, retry } = input;
  if (input.live && input.contextError) {
    return isOffline(input.contextError)
      ? { kind: 'offline', retry }
      : { kind: 'error', correlationId: referenceOf(input.contextError), retry };
  }
  if (input.resolving || query.isPending) return { kind: 'loading' };
  if (query.isError) {
    if (isOffline(query.error)) {
      if (query.data) {
        return {
          kind: 'ready',
          data: {
            ...query.data,
            offline: true,
            now: input.now,
            lastSyncAt: new Date(query.dataUpdatedAt).toISOString(),
          },
        };
      }
      return { kind: 'offline', retry };
    }
    return { kind: 'error', correlationId: referenceOf(query.error), retry };
  }
  if (!query.data) return { kind: 'loading' };
  return { kind: 'ready', data: query.data };
}

export function CommandCenterPage({ state }: { state: DashboardState }) {
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const orgs = useQuery(orgsQuery);
  const org = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(org?.id ?? ''), enabled: Boolean(org) });
  const trip = useActiveTrip(org?.id ?? '', trips.data);
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

  const view = commandCenterState({
    live: state === 'live',
    resolving,
    contextError: orgs.isError ? orgs.error : org && trips.isError ? trips.error : null,
    query: {
      isPending: q.isPending,
      isError: q.isError,
      error: q.error,
      data: q.data,
      dataUpdatedAt: q.dataUpdatedAt,
    },
    retry: () => {
      void orgs.refetch();
      if (org) void trips.refetch();
      if (!resolving) void q.refetch();
    },
    now: new Date().toISOString(),
  });

  const onSwitchTrip = useLive ? (id: string) => writeActiveTripId(org.id, id) : undefined;
  const onCreateTrip = useLive
    ? async (input: NewTripInput) => {
        const created = await setup.createTrip(org.id, input);
        writeActiveTripId(org.id, created.id);
        await qc.invalidateQueries({ queryKey: tripsQuery(org.id).queryKey });
      }
    : undefined;

  return <CommandCenterView state={view} onSwitchTrip={onSwitchTrip} onCreateTrip={onCreateTrip} />;
}
