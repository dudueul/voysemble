// Copyright 2026- At Day. All rights reserved.
//
// Session and organization queries against the real API (slice 007). Shapes come from
// @voysemble/contracts; this module owns query keys, the active-organization choice, and the
// mutations the setup flow needs. Dashboard/itinerary data stay on fixtures until their slices.

import { queryOptions } from '@tanstack/react-query';
import type {
  AcceptInvitationResponse,
  AckStatus,
  AlbumPhotoRequest,
  Announcement,
  AnnouncementList,
  CareNote,
  CareNoteStatus,
  ChatChannelList,
  ChatMessage,
  ChatMessageList,
  CreateAnnouncementRequest,
  CreateDocumentRequirementRequest,
  DeletePhotoResponse,
  DocumentItem,
  DocumentItemList,
  DocumentRequirement,
  DocumentRequirementList,
  DocumentState,
  HeadcountList,
  Incident,
  IncidentList,
  IssueInvitesResponse,
  MeetingWindow,
  MeResponse,
  OpenWindowRequest,
  Organization,
  OrganizationList,
  OrganizationProfile,
  OrganizerInvitation,
  OrganizerInvitationList,
  OrgMemberList,
  Participation,
  PersonTimeline,
  Photo,
  PhotoList,
  ReauthAccepted,
  ReauthResponse,
  RemoveParticipationResponse,
  RevealCareNoteResponse,
  RevokeDevicesResponse,
  RevokeInviteResponse,
  RosterImportResponse,
  RosterResponse,
  SessionResponse,
  Trip,
  TripList,
  TripReport,
  UpdateDocumentRequirementRequest,
  UpdateOrganizationRequest,
  UpdateParticipationRequest,
  WindowList,
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

/** The organization with its settings (slice 036); any member reads it. */
export const orgProfileQuery = (orgId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'profile'],
    queryFn: () => api<OrganizationProfile>(`/v1/orgs/${orgId}`),
  });

/** Accounts in the organization with their roles (owner, organizer). */
export const orgMembersQuery = (orgId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'members'],
    queryFn: async () => (await api<OrgMemberList>(`/v1/orgs/${orgId}/members`)).members,
  });

/** Settings writes (slice 036, owner only). */
export const org = {
  update: (orgId: string, body: UpdateOrganizationRequest) =>
    api<OrganizationProfile>(`/v1/orgs/${orgId}`, { method: 'PATCH', body }),
};

/** Organizer invitations (slice 042, D33): the list for owners and organizers, newest first. */
export const orgInvitationsQuery = (orgId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'invitations'],
    queryFn: async () =>
      (await api<OrganizerInvitationList>(`/v1/orgs/${orgId}/invitations`)).invitations,
  });

export const invitations = {
  /** Owner: email a one-time link; the organization's default language when none is given. */
  create: (orgId: string, email: string, locale?: 'ko' | 'en') =>
    api<OrganizerInvitation>(`/v1/orgs/${orgId}/invitations`, {
      method: 'POST',
      body: locale ? { email, locale } : { email },
    }),
  revoke: (orgId: string, invitationId: string) =>
    api<OrganizerInvitation>(`/v1/orgs/${orgId}/invitations/${invitationId}`, {
      method: 'DELETE',
    }),
  /** The invitee, signed in with the invited address, with the token from the emailed link. */
  accept: (token: string) =>
    api<AcceptInvitationResponse>('/v1/invitations/accept', { method: 'POST', body: { token } }),
};

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

/** Roster row actions on the person card (slice 028). */
export const roster = {
  update: (
    orgId: string,
    tripId: string,
    participationId: string,
    body: UpdateParticipationRequest,
  ) =>
    api<Participation>(`/v1/orgs/${orgId}/trips/${tripId}/roster/${participationId}`, {
      method: 'PATCH',
      body,
    }),
  remove: (orgId: string, tripId: string, participationId: string) =>
    api<RemoveParticipationResponse>(
      `/v1/orgs/${orgId}/trips/${tripId}/roster/${participationId}`,
      {
        method: 'DELETE',
      },
    ),
  revokeInvite: (orgId: string, tripId: string, participationId: string) =>
    api<RevokeInviteResponse>(
      `/v1/orgs/${orgId}/trips/${tripId}/roster/${participationId}/revoke-invite`,
      { method: 'POST' },
    ),
  /** Lost or stolen device (D28, slice 031): every phone signed out, a fresh code minted. */
  revokeDevices: (orgId: string, tripId: string, participationId: string) =>
    api<RevokeDevicesResponse>(
      `/v1/orgs/${orgId}/trips/${tripId}/roster/${participationId}/revoke-devices`,
      { method: 'POST' },
    ),
};

/** One person's card and timeline (slice 026, D17). */
export const personTimelineQuery = (orgId: string, tripId: string, participationId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips', tripId, 'people', participationId, 'timeline'],
    queryFn: async () =>
      api<PersonTimeline>(`/v1/orgs/${orgId}/trips/${tripId}/people/${participationId}/timeline`),
  });

/** Care notes (D27, slice 030): the status is cheap and content-free; the content needs a reveal. */
export const careStatusQuery = (orgId: string, tripId: string, participationId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips', tripId, 'people', participationId, 'care-note'],
    queryFn: async () =>
      api<CareNoteStatus>(`/v1/orgs/${orgId}/trips/${tripId}/people/${participationId}/care-note`),
  });

export const care = {
  put: (orgId: string, tripId: string, participationId: string, note: CareNote) =>
    api<CareNoteStatus>(`/v1/orgs/${orgId}/trips/${tripId}/people/${participationId}/care-note`, {
      method: 'PUT',
      body: note,
    }),
  /** Audited on the server: the reveal lands on the person's timeline. */
  reveal: (orgId: string, tripId: string, participationId: string) =>
    api<RevealCareNoteResponse>(
      `/v1/orgs/${orgId}/trips/${tripId}/people/${participationId}/care-note/reveal`,
      { method: 'POST' },
    ),
};

/** Photos (D18, slice 043): what the caller may see, newest first; polled while the page is open. */
export const photosQuery = (orgId: string, tripId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips', tripId, 'media'],
    queryFn: async () => api<PhotoList>(`/v1/orgs/${orgId}/trips/${tripId}/media`),
    refetchInterval: 30_000,
  });

export const media = {
  /** `original`, optional `thumbnail` (made on this device), optional `takenAt`. */
  upload: (orgId: string, tripId: string, form: FormData) =>
    api<Photo>(`/v1/orgs/${orgId}/trips/${tripId}/media`, { method: 'POST', form }),
  review: (orgId: string, tripId: string, photoId: string, decision: 'clear' | 'remove') =>
    api<Photo | DeletePhotoResponse>(`/v1/orgs/${orgId}/trips/${tripId}/media/${photoId}/review`, {
      method: 'POST',
      body: { decision },
    }),
  album: (orgId: string, tripId: string, photoId: string, tags: AlbumPhotoRequest) =>
    api<Photo>(`/v1/orgs/${orgId}/trips/${tripId}/media/${photoId}/album`, {
      method: 'PUT',
      body: tags,
    }),
  unalbum: (orgId: string, tripId: string, photoId: string) =>
    api<Photo>(`/v1/orgs/${orgId}/trips/${tripId}/media/${photoId}/album`, { method: 'DELETE' }),
  remove: (orgId: string, tripId: string, photoId: string) =>
    api<DeletePhotoResponse>(`/v1/orgs/${orgId}/trips/${tripId}/media/${photoId}`, {
      method: 'DELETE',
    }),
};

/** Documents and forms (D27, slice 045): the requirements with their counts, and one requirement's rows. */
export const documentsQuery = (orgId: string, tripId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips', tripId, 'documents'],
    queryFn: () => api<DocumentRequirementList>(`/v1/orgs/${orgId}/trips/${tripId}/documents`),
  });

export const documentItemsQuery = (orgId: string, tripId: string, requirementId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips', tripId, 'documents', requirementId],
    queryFn: () =>
      api<DocumentItemList>(`/v1/orgs/${orgId}/trips/${tripId}/documents/${requirementId}/items`),
  });

export const documents = {
  create: (orgId: string, tripId: string, body: CreateDocumentRequirementRequest) =>
    api<DocumentRequirement>(`/v1/orgs/${orgId}/trips/${tripId}/documents`, {
      method: 'POST',
      body,
    }),
  update: (
    orgId: string,
    tripId: string,
    requirementId: string,
    body: UpdateDocumentRequirementRequest,
  ) =>
    api<DocumentRequirement>(`/v1/orgs/${orgId}/trips/${tripId}/documents/${requirementId}`, {
      method: 'PATCH',
      body,
    }),
  remove: (orgId: string, tripId: string, requirementId: string) =>
    api<{ deleted: true }>(`/v1/orgs/${orgId}/trips/${tripId}/documents/${requirementId}`, {
      method: 'DELETE',
    }),
  setState: (
    orgId: string,
    tripId: string,
    requirementId: string,
    participationId: string,
    state: DocumentState,
  ) =>
    api<DocumentItem>(
      `/v1/orgs/${orgId}/trips/${tripId}/documents/${requirementId}/items/${participationId}`,
      { method: 'PUT', body: { state } },
    ),
  uploadScan: (
    orgId: string,
    tripId: string,
    requirementId: string,
    participationId: string,
    form: FormData,
  ) =>
    api<DocumentItem>(
      `/v1/orgs/${orgId}/trips/${tripId}/documents/${requirementId}/items/${participationId}/scan`,
      { method: 'POST', form },
    ),
  removeScan: (orgId: string, tripId: string, requirementId: string, participationId: string) =>
    api<DocumentItem>(
      `/v1/orgs/${orgId}/trips/${tripId}/documents/${requirementId}/items/${participationId}/scan`,
      { method: 'DELETE' },
    ),
  /** The reveal (a POST: an audited action) fetches bytes itself; 403 REAUTH_REQUIRED means confirm first (D35). */
  revealPath: (orgId: string, tripId: string, requirementId: string, participationId: string) =>
    `/v1/orgs/${orgId}/trips/${tripId}/documents/${requirementId}/items/${participationId}/scan/reveal`,
};

/** The trip report (slice 034): composed on the server from acks, head counts, incidents, fees. */
export const reportQuery = (orgId: string, tripId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips', tripId, 'report'],
    queryFn: async () => api<TripReport>(`/v1/orgs/${orgId}/trips/${tripId}/report`),
  });

/** Chat channels (D22, slice 033): the organizer's list, polled while the page is open. */
export const chatsQuery = (orgId: string, tripId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips', tripId, 'chats'],
    queryFn: async () =>
      (await api<ChatChannelList>(`/v1/orgs/${orgId}/trips/${tripId}/chats`)).channels,
    refetchInterval: 15_000,
  });

export const chatMessagesQuery = (orgId: string, tripId: string, channelId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips', tripId, 'chats', channelId],
    queryFn: async () =>
      api<ChatMessageList>(
        `/v1/orgs/${orgId}/trips/${tripId}/chats/${encodeURIComponent(channelId)}/messages`,
      ),
    refetchInterval: 15_000,
  });

export const chat = {
  send: (orgId: string, tripId: string, channelId: string, body: string) =>
    api<ChatMessage>(
      `/v1/orgs/${orgId}/trips/${tripId}/chats/${encodeURIComponent(channelId)}/messages`,
      { method: 'POST', body: { body } },
    ),
};

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
  /** Organizer action (D17): compose the guardian message from the latest leader confirmation. */
  sendGuardianMessage: (orgId: string, tripId: string, incidentId: string) =>
    api<Incident>(`/v1/orgs/${orgId}/trips/${tripId}/incidents/${incidentId}/guardian-message`, {
      method: 'POST',
    }),
};

/** Meeting windows (D15, slice 029): newest first; polled while the Safety page is open so states move. */
export const windowsQuery = (orgId: string, tripId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips', tripId, 'windows'],
    queryFn: async () =>
      (await api<WindowList>(`/v1/orgs/${orgId}/trips/${tripId}/windows`)).windows,
    refetchInterval: 30_000,
  });

export const windows = {
  /** Staff open a window; the meeting point is the only coordinate the service keeps, while open. */
  open: (orgId: string, tripId: string, body: OpenWindowRequest) =>
    api<MeetingWindow>(`/v1/orgs/${orgId}/trips/${tripId}/windows`, { method: 'POST', body }),
  close: (orgId: string, tripId: string, windowId: string) =>
    api<MeetingWindow>(`/v1/orgs/${orgId}/trips/${tripId}/windows/${windowId}/close`, {
      method: 'POST',
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
  /** Slice 038: the account's language, read back by /v1/me on the next sign-in. */
  updateLocale: (locale: 'ko' | 'en') =>
    api<MeResponse>('/v1/me', { method: 'PATCH', body: { locale } }),
  /** Slice 045 (D35): a confirmation link to the account's own address, then its token. */
  reauth: () => api<ReauthAccepted>('/v1/auth/reauth', { method: 'POST' }),
  reauthVerify: (token: string) =>
    api<ReauthResponse>('/v1/auth/reauth/verify', { method: 'POST', body: { token } }),
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
