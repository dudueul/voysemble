// Copyright 2026- At Day. All rights reserved.
//
// Organization contracts. An organization is the data boundary (ADR-0001) and the unit of
// encryption keys (ADR-0005). Created by any signed-in account, who becomes its owner (D26).

import { z } from '@hono/zod-openapi';
import { Email } from './auth';
import { Id, Locale, OrgRole, Timestamp } from './common';
import { TimeZone } from './trip';

export const OrganizationName = z.string().trim().min(1).max(120);

export const CreateOrganizationRequest = z
  .object({
    name: OrganizationName,
    defaultLocale: Locale.default('ko'),
  })
  .openapi('CreateOrganizationRequest');
export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequest>;

export const Organization = z
  .object({
    id: Id,
    name: OrganizationName,
    defaultLocale: Locale,
    createdAt: Timestamp,
    /** The caller's role in this organization. */
    role: OrgRole,
  })
  .openapi('Organization');
export type Organization = z.infer<typeof Organization>;

export const OrganizationList = z
  .object({ organizations: z.array(Organization) })
  .openapi('OrganizationList');
export type OrganizationList = z.infer<typeof OrganizationList>;

/* ---------- Organization settings and members (slice 036) ---------- */

const ClockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm');

/** D29: quiet hours in the organization's zone; only the priority lane crosses them. */
export const QuietHours = z.object({ from: ClockTime, to: ClockTime }).openapi('QuietHours');
export type QuietHours = z.infer<typeof QuietHours>;

/**
 * Organization-level rules the console edits on Settings. Notification lanes (D29) and the
 * crypto-shred (D20) read these when they are built; until then they are stored facts.
 */
export const OrganizationSettings = z
  .object({
    /** IANA zone the organization plans in; trips carry their own. Validated by Intl on the server. */
    timeZone: TimeZone,
    quietHours: QuietHours,
    /** D29: the guardian digest's local hour, HH:mm. */
    guardianDigestAt: ClockTime,
    /** D20: days after a trip closes before its personal data is shredded; 30 to 365. */
    wrapUpDays: z.number().int().min(30).max(365),
  })
  .openapi('OrganizationSettings');
export type OrganizationSettings = z.infer<typeof OrganizationSettings>;

export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationSettings = {
  timeZone: 'Asia/Seoul',
  quietHours: { from: '23:00', to: '06:30' },
  guardianDigestAt: '19:00',
  wrapUpDays: 90,
};

/** `GET /v1/orgs/{orgId}`: the organization with its settings and the caller's role. */
export const OrganizationProfile = Organization.extend({ settings: OrganizationSettings }).openapi(
  'OrganizationProfile',
);
export type OrganizationProfile = z.infer<typeof OrganizationProfile>;

/** `PATCH /v1/orgs/{orgId}` (owner): any subset; absent fields stay as they are. */
export const UpdateOrganizationRequest = z
  .object({
    name: OrganizationName.optional(),
    defaultLocale: Locale.optional(),
    settings: OrganizationSettings.partial().optional(),
  })
  .openapi('UpdateOrganizationRequest');
export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationRequest>;

/** One account's membership in the organization (D21); the email is the only name an account has. */
export const OrgMember = z
  .object({
    accountId: Id,
    email: z.string(),
    role: OrgRole,
    joinedAt: Timestamp,
    /** True on the caller's own row. */
    you: z.boolean(),
  })
  .openapi('OrgMember');
export type OrgMember = z.infer<typeof OrgMember>;

export const OrgMemberList = z.object({ members: z.array(OrgMember) }).openapi('OrgMemberList');
export type OrgMemberList = z.infer<typeof OrgMemberList>;

/* ---------- Organizer invitations (slice 042, D33) ---------- */

/** Derived on read: pending until accepted or revoked, expired once past `expiresAt`. */
export const InvitationStatus = z
  .enum(['pending', 'accepted', 'expired', 'revoked'])
  .openapi('InvitationStatus');
export type InvitationStatus = z.infer<typeof InvitationStatus>;

/**
 * `POST /v1/orgs/{orgId}/invitations` (owner): email one organizer invitation. The role is
 * always `organizer`: ownership is never granted by invitation (D33); leaders, travelers and
 * guardians join by invite code (`InviteRole`) and never gain console authority.
 */
export const CreateOrganizerInvitationRequest = z
  .object({
    email: Email,
    /** Language of the email; the organization's default language when absent. */
    locale: Locale.optional(),
  })
  .openapi('CreateOrganizerInvitationRequest');
export type CreateOrganizerInvitationRequest = z.infer<typeof CreateOrganizerInvitationRequest>;

export const OrganizerInvitation = z
  .object({
    id: Id,
    email: z.string(),
    role: z.literal('organizer'),
    status: InvitationStatus,
    /** Address of the owner who sent it. */
    invitedBy: z.string(),
    createdAt: Timestamp,
    /** Seven days after `createdAt`. */
    expiresAt: Timestamp,
    acceptedAt: Timestamp.nullable(),
    revokedAt: Timestamp.nullable(),
  })
  .openapi('OrganizerInvitation');
export type OrganizerInvitation = z.infer<typeof OrganizerInvitation>;

/** `GET /v1/orgs/{orgId}/invitations` (organizer): newest first. */
export const OrganizerInvitationList = z
  .object({ invitations: z.array(OrganizerInvitation) })
  .openapi('OrganizerInvitationList');
export type OrganizerInvitationList = z.infer<typeof OrganizerInvitationList>;

/** `POST /v1/invitations/accept`: the token from the emailed link, sent by the signed-in account. */
export const AcceptInvitationRequest = z
  .object({
    token: z.string().min(32).max(128).describe('Opaque token from the emailed link.'),
  })
  .openapi('AcceptInvitationRequest');
export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationRequest>;

export const AcceptInvitationResponse = z
  .object({
    organizationId: Id,
    organizationName: z.string(),
    /** The caller's role after accepting: organizer, or owner when they already owned it. */
    role: OrgRole,
    /** True when the account was already an owner or organizer; nothing changed. */
    alreadyMember: z.boolean(),
  })
  .openapi('AcceptInvitationResponse');
export type AcceptInvitationResponse = z.infer<typeof AcceptInvitationResponse>;
