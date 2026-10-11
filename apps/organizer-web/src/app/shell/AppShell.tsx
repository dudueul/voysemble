// Copyright 2026- At Day. All rights reserved.
// Layout frame: sidebar + top bar + routed page. Organization, trip, and account come from the
// real session (slice 007). The alert dot still comes from the dashboard fixture until the
// command center moves onto the API.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { fetchDashboard } from '../../lib/dashboard-api';
import { auth, meQuery, orgsQuery, pickActiveOrg, tripsQuery } from '../../lib/session';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery(meQuery);
  const orgs = useQuery(orgsQuery);
  const activeOrg = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(activeOrg?.id ?? ''), enabled: Boolean(activeOrg) });
  const activeTrip = trips.data?.[0] ?? null;
  const { data } = useQuery({
    queryKey: ['dashboard', 'live'],
    queryFn: () => fetchDashboard('live'),
    staleTime: 60_000,
  });
  const orgName = activeOrg?.name ?? (orgs.isPending ? '…' : 'No organization yet');
  const signOut = async () => {
    await auth.logout();
    qc.clear();
    await navigate({ to: '/sign-in' });
  };
  return (
    <div className="shell">
      <Sidebar orgName={orgName} showSetup={!orgs.isPending && (orgs.data?.length ?? 0) === 0} />
      <div className="main">
        <TopBar
          orgName={orgName}
          tripName={activeTrip?.name ?? null}
          tripStatus={activeTrip ? tripStatusOn(activeTrip, new Date()) : null}
          accountLabel={me.data?.email ?? ''}
          hasAlerts={Boolean(data?.alerts.some((a) => a.severity === 'red'))}
          onSignOut={() => void signOut()}
        />
        <Outlet />
      </div>
    </div>
  );
}

/** Derived from dates only; trips carry no explicit status yet. */
export function tripStatusOn(
  trip: { startsOn: string; endsOn: string },
  now: Date,
): 'planning' | 'active' | 'completed' {
  const today = now.toISOString().slice(0, 10);
  if (today < trip.startsOn) return 'planning';
  if (today > trip.endsOn) return 'completed';
  return 'active';
}
