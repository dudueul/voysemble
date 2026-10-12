// Copyright 2026- At Day. All rights reserved.
// Layout frame: sidebar + top bar + routed page. Organization, trip, and account come from the
// real session (slice 007). The alert dot reads open incidents of the active trip (slice 014)
// and falls back to the fixture dashboard only while no trip exists (sample mode). The active
// trip is the organizer's remembered choice (slice 063, `useActiveTrip`); the top bar switches it.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { fetchDashboard } from '../../lib/dashboard-api';
import {
  auth,
  incidentsQuery,
  meQuery,
  orgsQuery,
  pickActiveOrg,
  tripsQuery,
  useActiveTrip,
  writeActiveTripId,
} from '../../lib/session';
import { getLocale, hasStoredLocale, otherLocale, setLocale } from '../../lib/strings';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  // Phone drawer (<= 768px). Closes on navigation so a tap on a link never leaves it open.
  const [navOpen, setNavOpen] = useState(false);
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  useEffect(() => setNavOpen(false), [pathname]);
  const me = useQuery(meQuery);
  // Slice 038: the account's language wins on a browser that has no choice of its own yet.
  const accountLocale = me.data?.locale;
  useEffect(() => {
    if (accountLocale && !hasStoredLocale()) setLocale(accountLocale);
  }, [accountLocale]);
  const switchLocale = () => {
    const next = otherLocale(getLocale());
    setLocale(next);
    void auth.updateLocale(next).then(
      () => qc.invalidateQueries({ queryKey: meQuery.queryKey }),
      () => undefined,
    );
  };
  const orgs = useQuery(orgsQuery);
  const activeOrg = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(activeOrg?.id ?? ''), enabled: Boolean(activeOrg) });
  const activeTrip = useActiveTrip(activeOrg?.id ?? '', trips.data);
  const { data } = useQuery({
    queryKey: ['dashboard', 'live'],
    queryFn: () => fetchDashboard('live'),
    staleTime: 60_000,
    enabled: !trips.isPending && activeTrip === null,
  });
  const incidents = useQuery({
    ...incidentsQuery(activeOrg?.id ?? '', activeTrip?.id ?? ''),
    enabled: Boolean(activeOrg && activeTrip),
    staleTime: 15_000,
  });
  const hasAlerts = activeTrip
    ? Boolean(incidents.data?.some((i) => i.status === 'open'))
    : Boolean(data?.alerts.some((a) => a.severity === 'red'));
  const orgName = activeOrg?.name ?? (orgs.isPending ? '…' : 'No organization yet');
  const signOut = async () => {
    await auth.logout();
    qc.clear();
    await navigate({ to: '/sign-in' });
  };
  return (
    <div className="shell">
      <Sidebar
        orgName={orgName}
        showSetup={!orgs.isPending && (orgs.data?.length ?? 0) === 0}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />
      <div className="main">
        <TopBar
          orgName={orgName}
          trips={trips.data ?? []}
          activeTripId={activeTrip?.id ?? null}
          tripStatus={activeTrip ? tripStatusOn(activeTrip, new Date()) : null}
          accountLabel={me.data?.email ?? ''}
          accountName={me.data?.displayName ?? null}
          hasAlerts={hasAlerts}
          onSignOut={() => void signOut()}
          onMenu={() => setNavOpen((v) => !v)}
          menuOpen={navOpen}
          onSwitchLocale={switchLocale}
          onSwitchTrip={(id) => {
            if (activeOrg) writeActiveTripId(activeOrg.id, id);
          }}
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
