// Copyright 2026- At Day. All rights reserved.
// Code-based TanStack Router tree.
// Public: /sign-in, /auth/verify. Everything else sits under a pathless layout whose beforeLoad
// requires a session (GET /v1/me) and redirects to /sign-in otherwise. `/` = command center on
// fixtures; /setup = first-run checklist on the real API; other sections are honest placeholders.

import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { SignInPage } from '../features/auth/SignInPage';
import { VerifyPage } from '../features/auth/VerifyPage';
import { CommandCenterPage } from '../features/command-center/CommandCenterPage';
import { ItineraryPage } from '../features/itinerary/ItineraryPage';
import { PlaceholderPage } from '../features/placeholder/PlaceholderPage';
import { SetupPage } from '../features/setup/SetupPage';
import { DashboardState } from '../lib/dashboard-api';
import { queryClient } from '../lib/query-client';
import { meQuery } from '../lib/session';
import { strings } from '../lib/strings';
import { AppShell } from './shell/AppShell';

const rootRoute = createRootRoute();

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: SignInPage,
});

const verifyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/verify',
  component: VerifyPage,
});

/** Session gate. Runs before any protected page loads; the shell then reads the cached `me`. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ location }) => {
    const me = await queryClient.ensureQueryData(meQuery);
    if (!me) {
      throw redirect({ to: '/sign-in', search: { next: location.pathname } });
    }
    return { me };
  },
  component: AppShell,
});

const searchSchema = z.object({ state: DashboardState.optional() });

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  validateSearch: (s) => searchSchema.parse(s),
  component: function Index() {
    const { state } = indexRoute.useSearch();
    return <CommandCenterPage state={state ?? 'live'} />;
  },
});

const setupRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/setup',
  component: SetupPage,
});

const itinerarySearch = z.object({
  state: DashboardState.optional(),
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const itineraryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/itinerary',
  validateSearch: (s) => itinerarySearch.parse(s),
  component: function ItineraryRoute() {
    const { state, day } = itineraryRoute.useSearch();
    const navigate = itineraryRoute.useNavigate();
    return (
      <ItineraryPage
        state={state ?? 'live'}
        {...(day ? { day } : {})}
        onDayChange={(d) =>
          void navigate({ search: (prev) => ({ ...prev, day: d }), replace: true })
        }
      />
    );
  },
});

const SECTIONS: Record<string, string> = {
  'journey-graph': strings.nav.journeyGraph,
  people: strings.nav.people,
  communication: strings.nav.communication,
  travel: strings.nav.travel,
  safety: strings.nav.safety,
  media: strings.nav.media,
  preparation: strings.nav.preparation,
  reports: strings.nav.reports,
  billing: strings.nav.billing,
  settings: strings.nav.settings,
};

const sectionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/$section',
  component: function Section() {
    const { section } = sectionRoute.useParams();
    return <PlaceholderPage title={SECTIONS[section] ?? section} />;
  },
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    signInRoute,
    verifyRoute,
    appRoute.addChildren([indexRoute, setupRoute, itineraryRoute, sectionRoute]),
  ]),
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
