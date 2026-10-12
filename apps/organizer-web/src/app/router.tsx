// Copyright 2026- At Day. All rights reserved.
// Code-based TanStack Router tree.
// Public: /sign-in, /auth/verify, /auth/reauth (slice 045), /invitations/accept (slice 042),
// /driver/$orgId (slice 049, the driver's bus sheet), /hotel/$orgId (slice 058, the hotel's
// sheet). Everything else sits under a
// pathless layout whose beforeLoad
// requires a session (GET /v1/me) and redirects to /sign-in otherwise. `/` = command center on
// fixtures; /setup = first-run checklist on the real API; other sections are honest placeholders.

import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { AcceptInvitationPage } from '../features/auth/AcceptInvitationPage';
import { ReauthPage } from '../features/auth/ReauthPage';
import { SignInPage } from '../features/auth/SignInPage';
import { VerifyPage } from '../features/auth/VerifyPage';
import { CommandCenterPage } from '../features/command-center/CommandCenterPage';
import { DriverSheetPage } from '../features/driver/DriverSheetPage';
import { HotelSheetPage } from '../features/hotel/HotelSheetPage';
import { ItineraryPage } from '../features/itinerary/ItineraryPage';
import { RevisionHistoryPage } from '../features/itinerary/RevisionHistoryPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { PlaceholderPage } from '../features/placeholder/PlaceholderPage';
import { BillingPage } from '../features/sections/BillingPage';
import { CommunicationPage } from '../features/sections/CommunicationPage';
import { JourneyGraphPage } from '../features/sections/JourneyGraphPage';
import { MediaPage } from '../features/sections/MediaPage';
import { PeoplePage } from '../features/sections/PeoplePage';
import { PreparationPage } from '../features/sections/PreparationPage';
import { ReportsPage } from '../features/sections/ReportsPage';
import { SafetyPage } from '../features/sections/SafetyPage';
import { SettingsPage } from '../features/sections/SettingsPage';
import { TravelPage } from '../features/sections/TravelPage';
import { SetupPage } from '../features/setup/SetupPage';
import { DashboardState } from '../lib/dashboard-api';
import { queryClient } from '../lib/query-client';
import { meQuery } from '../lib/session';
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

/** The step-up confirmation link lands here (slice 045, D35) and returns to the page that asked. */
const reauthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/reauth',
  component: ReauthPage,
});

/** The driver's sealed link lands here (slice 049): no session, the token in the fragment. */
const driverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/driver/$orgId',
  component: DriverSheetPage,
});

/** The emailed organizer invitation lands here (slice 042); signed out, it shows the sign-in form. */
/** The hotel's sealed link lands here (slice 058): no session, the token in the fragment. */
const hotelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/hotel/$orgId',
  component: HotelSheetPage,
});

const acceptInvitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invitations/accept',
  component: AcceptInvitationPage,
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

/** The revision history (slice 057, D19): every publish kept; the editor's "History" leads here. */
const revisionHistoryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/itinerary/history',
  component: RevisionHistoryPage,
});

/** Sample section pages (slice 008): fixtures with the "Sample data" chip; status `simulated`. */
const SECTION_PAGES = {
  'journey-graph': JourneyGraphPage,
  people: PeoplePage,
  communication: CommunicationPage,
  travel: TravelPage,
  safety: SafetyPage,
  media: MediaPage,
  preparation: PreparationPage,
  reports: ReportsPage,
  billing: BillingPage,
  settings: SettingsPage,
} as const;

const sectionRoutes = (Object.keys(SECTION_PAGES) as (keyof typeof SECTION_PAGES)[]).map((key) =>
  createRoute({ getParentRoute: () => appRoute, path: `/${key}`, component: SECTION_PAGES[key] }),
);

/** The notification log (slice 052, D29); the top bar's bell leads here. */
const notificationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/notifications',
  component: NotificationsPage,
});

/** Anything else under the shell stays an honest placeholder. */
const unknownRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/$section',
  component: function Section() {
    const { section } = unknownRoute.useParams();
    return <PlaceholderPage title={section} />;
  },
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    signInRoute,
    verifyRoute,
    reauthRoute,
    acceptInvitationRoute,
    driverRoute,
    hotelRoute,
    appRoute.addChildren([
      indexRoute,
      setupRoute,
      itineraryRoute,
      revisionHistoryRoute,
      notificationsRoute,
      ...sectionRoutes,
      unknownRoute,
    ]),
  ]),
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
