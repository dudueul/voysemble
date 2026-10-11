// Copyright 2026- At Day. All rights reserved.
//
// Session and organization queries against the real API (slice 007). Shapes come from
// @voysemble/contracts; this module owns query keys, the active-organization choice, and the
// mutations the setup flow needs. Dashboard/itinerary data stay on fixtures until their slices.

import { queryOptions } from '@tanstack/react-query';
import type {
  AckStatus,
  Announcement,
  AnnouncementList,
  CreateAnnouncementRequest,
  HeadcountList,
  Incident,
  IncidentList,
  IssueInvitesResponse,
  MeResponse,
  Organization,
  OrganizationList,
  Participation,
  RosterImportResponse,
  RosterResponse,
  SessionResponse,
  Trip,
  TripList,
} from '@voysemble/contracts';
import { ApiError, api } from './api-client';

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async (): Promise<MeResponse | null> => {
    try {
      return await api<MeResponse>('/v1/me');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  },
});

export const orgsQuery = queryOptions({
  queryKey: ['orgs'],
  queryFn: async () => (await api<OrganizationList>('/v1/orgs')).organizations,
});

export const tripsQuery = (orgId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips'],
    queryFn: async () => (await api<TripList>(`/v1/orgs/${orgId}/trips`)).trips,
  });

export const rosterQuery = (orgId: string, tripId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips', tripId, 'roster'],
    queryFn: async () =>
      (await api<RosterResponse>(`/v1/orgs/${orgId}/trips/${tripId}/roster`)).participations,
  });

export const announcementsQuery = (orgId: string, tripId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips', tripId, 'announcements'],
    queryFn: async () =>
      (await api<AnnouncementList>(`/v1/orgs/${orgId}/trips/${tripId}/announcements`))
        .announcements,
  });

export const ackStatusQuery = (orgId: string, tripId: string, announcementId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips', tripId, 'announcements', announcementId, 'acks'],
    queryFn: () =>
      api<AckStatus>(`/v1/orgs/${orgId}/trips/${tripId}/announcements/${announcementId}/acks`),
  });

export const announcements = {
  create: (orgId: string, tripId: string, input: CreateAnnouncementRequest) =>
    api<Announcement>(`/v1/orgs/${orgId}/trips/${tripId}/announcements`, {
      method: 'POST',
      body: input,
    }),
};

export const headcountsQuery = (orgId: string, tripId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips', tripId, 'headcounts'],
    queryFn: async () =>
      (await api<HeadcountList>(`/v1/orgs/${orgId}/trips/${tripId}/headcounts`)).headcounts,
  });

export const incidentsQuery = (orgId: string, tripId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips', tripId, 'incidents'],
    queryFn: async () =>
      (await api<IncidentList>(`/v1/orgs/${orgId}/trips/${tripId}/incidents`)).incidents,
  });

export const incidents = {
  resolve: (orgId: string, tripId: string, incidentId: string, note: string | null) =>
    api<Incident>(`/v1/orgs/${orgId}/trips/${tripId}/incidents/${incidentId}/resolve`, {
      method: 'POST',
      body: { note },
    }),
};

export const auth = {
  requestMagicLink: (email: string, locale: 'ko' | 'en') =>
    api<{ accepted: true; expiresInSeconds: number }>('/v1/auth/magic-link', {
      method: 'POST',
      body: { email, locale },
    }),
  verify: (token: string) =>
    api<SessionResponse>('/v1/auth/magic-link/verify', {
      method: 'POST',
      body: { token, client: 'web' },
    }),
  logout: () => api<{ loggedOut: true }>('/v1/auth/logout', { method: 'POST' }),
};

export const setup = {
  createOrg: (name: string, defaultLocale: 'ko' | 'en') =>
    api<Organization>('/v1/orgs', { method: 'POST', body: { name, defaultLocale } }),
  createTrip: (
    orgId: string,
    input: { name: string; startsOn: string; endsOn: string; timezone: string },
  ) => api<Trip>(`/v1/orgs/${orgId}/trips`, { method: 'POST', body: input }),
  importRoster: (orgId: string, tripId: string, csv: string) =>
    api<RosterImportResponse>(`/v1/orgs/${orgId}/trips/${tripId}/roster/import`, {
      method: 'POST',
      body: { csv },
    }),
  addLeader: (orgId: string, tripId: string, displayName: string, groupName: string | null) =>
    api<Participation>(`/v1/orgs/${orgId}/trips/${tripId}/roster/leaders`, {
      method: 'POST',
      body: { displayName, groupName },
    }),
  issueInvites: (orgId: string, tripId: string) =>
    api<IssueInvitesResponse>(`/v1/orgs/${orgId}/trips/${tripId}/invites`, { method: 'POST' }),
};

/** Remembered organization choice. Falls back to the first membership. */
const ACTIVE_ORG_KEY = 'vy.activeOrgId';

export function readActiveOrgId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ORG_KEY);
  } catch {
    return null;
  }
}

export function writeActiveOrgId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_ORG_KEY, id);
  } catch {
    // Private mode or blocked storage: the first org is used on next load.
  }
}

export function pickActiveOrg(orgs: Organization[]): Organization | null {
  const remembered = readActiveOrgId();
  return orgs.find((o) => o.id === remembered) ?? orgs[0] ?? null;
}
