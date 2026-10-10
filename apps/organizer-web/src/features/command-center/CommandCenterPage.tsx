// Copyright 2026- At Day. All rights reserved.
// Route component: wires TanStack Query to the pure view. `?state=` selects a fixture state.

import { useQuery } from '@tanstack/react-query';
import { DashboardFetchError, type DashboardState, fetchDashboard } from '../../lib/dashboard-api';
import { CommandCenterView } from './CommandCenterView';

export function CommandCenterPage({ state }: { state: DashboardState }) {
  const q = useQuery({
    queryKey: ['dashboard', state],
    queryFn: () => fetchDashboard(state),
    retry: false,
    staleTime: 60_000,
  });

  if (q.isPending) return <CommandCenterView state={{ kind: 'loading' }} />;
  if (q.isError) {
    const id = q.error instanceof DashboardFetchError ? q.error.correlationId : 'unknown';
    return (
      <CommandCenterView
        state={{ kind: 'error', correlationId: id, retry: () => void q.refetch() }}
      />
    );
  }
  return <CommandCenterView state={{ kind: 'ready', data: q.data }} />;
}
