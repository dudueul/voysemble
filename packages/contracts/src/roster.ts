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

export const RosterResponse = z
  .object({ participations: z.array(Participation) })
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
