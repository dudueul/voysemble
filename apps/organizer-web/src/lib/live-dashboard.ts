// Copyright 2026- At Day. All rights reserved.
//
// Command center on the API (slice 014). `buildDashboard` is a pure mapping from real API
// shapes to the `Dashboard` the view already renders; `fetchLiveDashboard` gathers the inputs.
// Movements stay empty until the itinerary moves onto the API; everything else is live:
// trips, traveler count, acknowledgment rate, open incidents as alerts, latest head count per
// group (amber when short), and the announcements' ack progress.

import type {
  Announcement as ApiAnnouncement,
  Trip as ApiTrip,
  HeadcountList,
  HeadcountSession,
  Incident,
  IncidentList,
  MeResponse,
  Organization,
  Participation,
  RosterResponse,
} from '@voysemble/contracts';
import type {
  Alert,
  Announcement,
  Dashboard,
  HeadcountGroup,
  Trip,
} from '../fixtures/korea-concert-tour';
import { api } from './api-client';
import { strings } from './strings';

export const WHOLE_TRIP = 'Whole trip';

export interface LiveDashboardInput {
  me: MeResponse | null;
  org: Organization;
  trips: ApiTrip[];
  activeTripId: string;
  roster: Participation[];
  announcements: ApiAnnouncement[];
  headcounts: HeadcountSession[];
  incidents: Incident[];
  /** ISO instant; injected so tests and captures are deterministic. */
  now: string;
}

/** Derived from dates only; trips carry no explicit status (same rule as the shell). */
export function tripStatusOn(
  trip: { startsOn: string; endsOn: string },
  now: string,
): Trip['status'] {
  const today = now.slice(0, 10);
  if (today < trip.startsOn) return 'planning';
  if (today > trip.endsOn) return 'completed';
  return 'active';
}

/** "Europe/Rome" → "Rome"; the console has no destination field yet. */
export function destinationFromTimeZone(timeZone: string): string {
  const city = timeZone.split('/').pop() ?? timeZone;
  return city.replace(/_/g, ' ');
}

/** Stable hue for synthetic cover art, from the trip id. */
export function hueOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** "nate@example.com" → "Nate"; the account has no display name yet. */
export function organizerNameFrom(email: string | undefined): string {
  const local = (email ?? '').split('@')[0] ?? '';
  const word = local.split(/[._-]/)[0] ?? '';
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : 'Organizer';
}

/** Newest session per group (whole-trip sessions under their own label). */
export function latestHeadcountGroups(sessions: HeadcountSession[]): HeadcountGroup[] {
  const latest = new Map<string, HeadcountSession>();
  for (const s of sessions) {
    const label = s.groupName ?? WHOLE_TRIP;
    const seen = latest.get(label);
    if (!seen || s.receivedAt > seen.receivedAt) latest.set(label, s);
  }
  return [...latest.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, s]) => ({ label, checkedIn: s.accounted, expected: s.expected }));
}

/** Open incident cards become red alerts; the detail names the people. */
export function alertsFromIncidents(incidents: Incident[], tripId: string): Alert[] {
  return incidents
    .filter((i) => i.status === 'open')
    .map((i) => ({
      id: i.id,
      tripId,
      severity: 'red' as const,
      title: i.title,
      detail: `${i.people.map((p) => p.displayName).join(', ')} · ${i.openedByName}`,
      at: i.openedAt,
      actions: [strings.dashboard.openSafety],
    }));
}

export function buildDashboard(input: LiveDashboardInput): Dashboard {
  const travelers = input.roster.filter((p) => p.role === 'traveler').length;
  const trips: Trip[] = input.trips.map((t) => ({
    id: t.id,
    name: t.name,
    destination: destinationFromTimeZone(t.timezone),
    timeZone: t.timezone,
    startDate: t.startsOn,
    endDate: t.endsOn,
    // Only the active trip's roster is loaded; other trips show 0 until selected.
    travelerCount: t.id === input.activeTripId ? travelers : 0,
    status: tripStatusOn(t, input.now),
    coverHue: hueOf(t.id),
  }));
  const announcements: Announcement[] = input.announcements
    .filter((a) => a.requiresAck)
    .map((a) => ({
      id: a.id,
      title: a.title,
      acknowledged: a.ackCount,
      total: a.ackTotal,
      publishedAt: a.publishedAt,
    }));
  return {
    organizerName: organizerNameFrom(input.me?.email),
    organizationName: input.org.name,
    now: input.now,
    lastSyncAt: input.now,
    offline: false,
    live: true,
    trips,
    activeTripId: input.activeTripId,
    movements: [],
    alerts: alertsFromIncidents(input.incidents, input.activeTripId),
    headcount: latestHeadcountGroups(input.headcounts),
    announcements,
  };
}

export async function fetchLiveDashboard(
  me: MeResponse | null,
  org: Organization,
  trips: ApiTrip[],
  activeTripId: string,
  now: () => string = () => new Date().toISOString(),
): Promise<Dashboard> {
  const base = `/v1/orgs/${org.id}/trips/${activeTripId}`;
  const [roster, announcements, headcounts, incidents] = await Promise.all([
    api<RosterResponse>(`${base}/roster`),
    api<{ announcements: ApiAnnouncement[] }>(`${base}/announcements`),
    api<HeadcountList>(`${base}/headcounts`),
    api<IncidentList>(`${base}/incidents`),
  ]);
  return buildDashboard({
    me,
    org,
    trips,
    activeTripId,
    roster: roster.participations,
    announcements: announcements.announcements,
    headcounts: headcounts.headcounts,
    incidents: incidents.incidents,
    now: now(),
  });
}
