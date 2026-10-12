// Copyright 2026- At Day. All rights reserved.
//
// Roster and invite contracts (D12, D21, D26). A roster row becomes a participation; a guardian
// column becomes a second participation bound to the traveler. Invite codes are minted per
// participation and shown exactly once.

import { z } from '@hono/zod-openapi';
import { Id, InviteRole, Timestamp, TripRole } from './common';

export const DisplayName = z.string().trim().min(1).max(80);
export const GroupName = z.string().trim().min(1).max(40);

/**
 * CSV text, UTF-8, header row required. Columns (order free, names case-insensitive):
 * name, group, guardian_name, guardian_contact. Extra columns are ignored. Limits are enforced
 * by the bounded parser: 64 KiB, 2000 data rows, 2 KiB per row.
 */
export const RosterImportRequest = z
  .object({
    csv: z.string().min(1).max(65_536),
  })
  .openapi('RosterImportRequest');
export type RosterImportRequest = z.infer<typeof RosterImportRequest>;

/** Leaders are added by name by an organizer; they are not roster CSV rows. */
export const AddLeaderRequest = z
  .object({
    displayName: DisplayName,
    groupName: GroupName.nullable().default(null),
  })
  .openapi('AddLeaderRequest');
export type AddLeaderRequest = z.infer<typeof AddLeaderRequest>;

export const Participation = z
  .object({
    id: Id,
    tripId: Id,
    role: TripRole,
    displayName: DisplayName,
    groupName: GroupName.nullable(),
    /** For guardians: the traveler participation this guardian is bound to. */
    guardianOf: Id.nullable(),
    /** Set once an invite for this row has been redeemed. */
    accountId: Id.nullable(),
    createdAt: Timestamp,
  })
  .openapi('Participation');
export type Participation = z.infer<typeof Participation>;

/** Edit a roster row's name or group (slice 028); absent fields stay. */
export const UpdateParticipationRequest = z
  .object({
    displayName: DisplayName.optional(),
    groupName: GroupName.nullable().optional(),
  })
  .openapi('UpdateParticipationRequest');
export type UpdateParticipationRequest = z.infer<typeof UpdateParticipationRequest>;

/** Rows removed together: the row and, for a traveler, the guardians bound to it. */
export const RemoveParticipationResponse = z
  .object({ removed: z.array(Id) })
  .openapi('RemoveParticipationResponse');
export type RemoveParticipationResponse = z.infer<typeof RemoveParticipationResponse>;

export const RevokeInviteResponse = z
  .object({ revoked: z.number().int() })
  .openapi('RevokeInviteResponse');
export type RevokeInviteResponse = z.infer<typeof RevokeInviteResponse>;

export const RosterImportResponse = z
  .object({
    created: z.number().int(),
    skipped: z
      .array(z.object({ line: z.number().int(), reason: z.string() }))
      .describe('Rows the parser rejected. The rest were imported.'),
    participations: z.array(Participation),
  })
  .openapi('RosterImportResponse');
export type RosterImportResponse = z.infer<typeof RosterImportResponse>;

/**
 * Where a roster row stands on its way into the trip (slice 023, People page): `joined` once an
 * account redeemed its code; `issued` while an unredeemed, unrevoked code is still valid;
 * `expired` when every open code has passed its expiry; `none` before any code was issued.
 */
export const InviteStatus = z.enum(['none', 'issued', 'expired', 'joined']).openapi('InviteStatus');
export type InviteStatus = z.infer<typeof InviteStatus>;

/** A roster row as the People page reads it: the participation plus two computed facts. */
export const RosterEntry = Participation.extend({
  invite: InviteStatus,
  /** Server receipt time of this person's latest acknowledgment; null if they never acked. */
  lastAckAt: Timestamp.nullable(),
  /** A sealed care note is on file (D27); the content needs an audited reveal. */
  hasCareNote: z.boolean(),
}).openapi('RosterEntry');
export type RosterEntry = z.infer<typeof RosterEntry>;

export const RosterResponse = z
  .object({ participations: z.array(RosterEntry) })
  .openapi('RosterResponse');
export type RosterResponse = z.infer<typeof RosterResponse>;

/** Human-typed code shape, e.g. `K7PX-4MDQ`. Dashes and case are ignored on redeem. */
export const InviteCode = z
  .string()
  .regex(/^[A-Za-z0-9-]{8,12}$/)
  .describe('8 characters from an unambiguous alphabet, shown as XXXX-XXXX.');

export const IssuedInvite = z
  .object({
    participationId: Id,
    role: InviteRole,
    displayName: DisplayName,
    /** Shown once. Only its hash is stored. */
    code: InviteCode,
    expiresAt: Timestamp,
  })
  .openapi('IssuedInvite');
export type IssuedInvite = z.infer<typeof IssuedInvite>;

/**
 * Lost or stolen device (D28, slice 031): every native session of the person's account is revoked
 * with a wipe directive, the roster row is unbound, and a fresh invite code is minted so the
 * person re-enrols on a new phone with their groups restored.
 */
export const RevokeDevicesResponse = z
  .object({
    revokedSessions: z.number().int(),
    invite: IssuedInvite,
  })
  .openapi('RevokeDevicesResponse');
export type RevokeDevicesResponse = z.infer<typeof RevokeDevicesResponse>;

export const IssueInvitesResponse = z
  .object({ invites: z.array(IssuedInvite) })
  .openapi('IssueInvitesResponse');
export type IssueInvitesResponse = z.infer<typeof IssueInvitesResponse>;

export const RedeemInviteRequest = z.object({ code: InviteCode }).openapi('RedeemInviteRequest');
export type RedeemInviteRequest = z.infer<typeof RedeemInviteRequest>;

export const RedeemInviteResponse = z
  .object({
    organizationId: Id,
    organizationName: z.string(),
    tripId: Id,
    participation: Participation,
  })
  .openapi('RedeemInviteResponse');
export type RedeemInviteResponse = z.infer<typeof RedeemInviteResponse>;

/** A participation of the signed-in account, with the trip and organization it belongs to. */
export const MyParticipation = z
  .object({
    organizationId: Id,
    organizationName: z.string(),
    tripId: Id,
    tripName: z.string(),
    /** Slice 067: the trip's days and zone, so a phone can pick the trip that matters today. */
    startsOn: z.string(),
    endsOn: z.string(),
    timezone: z.string(),
    participation: Participation,
  })
  .openapi('MyParticipation');
export type MyParticipation = z.infer<typeof MyParticipation>;

export const MyParticipationList = z
  .object({ participations: z.array(MyParticipation) })
  .openapi('MyParticipationList');
export type MyParticipationList = z.infer<typeof MyParticipationList>;
