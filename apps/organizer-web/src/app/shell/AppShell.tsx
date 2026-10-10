// Copyright 2026- At Day. All rights reserved.
// Layout frame: sidebar + top bar + routed page. Shell context comes from the dashboard query so
// the org/trip selector is right even on placeholder pages.

import { useQuery } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { fetchDashboard } from '../../lib/dashboard-api';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell() {
  const { data } = useQuery({
    queryKey: ['dashboard', 'live'],
    queryFn: () => fetchDashboard('live'),
    staleTime: 60_000,
  });
  const activeTrip = data?.trips.find((t) => t.id === data.activeTripId) ?? null;
  return (
    <div className="shell">
      <Sidebar orgName={data?.organizationName ?? '…'} />
      <div className="main">
        <TopBar
          orgName={data?.organizationName ?? '…'}
          tripName={activeTrip?.name ?? null}
          tripStatus={activeTrip?.status ?? null}
          organizerName={data?.organizerName ?? ''}
          hasAlerts={Boolean(data?.alerts.some((a) => a.severity === 'red'))}
        />
        <Outlet />
      </div>
    </div>
  );
}
