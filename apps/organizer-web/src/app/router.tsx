// Copyright 2026- At Day. All rights reserved.
// Code-based TanStack Router tree. `/` = command center; other sections are honest placeholders
// until their slices land. Search params are Zod-validated.

import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { z } from 'zod';
import { CommandCenterPage } from '../features/command-center/CommandCenterPage';
import { PlaceholderPage } from '../features/placeholder/PlaceholderPage';
import { DashboardState } from '../lib/dashboard-api';
import { strings } from '../lib/strings';
import { AppShell } from './shell/AppShell';

const rootRoute = createRootRoute({ component: AppShell });

const searchSchema = z.object({ state: DashboardState.optional() });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (s) => searchSchema.parse(s),
  component: function Index() {
    const { state } = indexRoute.useSearch();
    return <CommandCenterPage state={state ?? 'live'} />;
  },
});

const SECTIONS: Record<string, string> = {
  itinerary: strings.nav.itinerary,
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
  getParentRoute: () => rootRoute,
  path: '/$section',
  component: function Section() {
    const { section } = sectionRoute.useParams();
    return <PlaceholderPage title={SECTIONS[section] ?? section} />;
  },
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, sectionRoute]),
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
