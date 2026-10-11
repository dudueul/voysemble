// Copyright 2026- At Day. All rights reserved.
//
// Shared primitives for identity and roster contracts. Roles are closed enums: adding a role is
// a contract change, never a free string. See ADR-0009 "Actors and identity".

import { z } from '@hono/zod-openapi';

/** UUID v4 minted by the server. Clients never invent ids for server-owned rows. */
export const Id = z.uuid().describe('Server-minted UUID.');

/** Organization-level role (membership = account x organization). */
export const OrgRole = z.enum(['owner', 'organizer', 'leader', 'member']).openapi('OrgRole');
export type OrgRole = z.infer<typeof OrgRole>;

/** Trip-level role (participation = membership x trip). */
export const TripRole = z.enum(['leader', 'traveler', 'guardian']).openapi('TripRole');
export type TripRole = z.infer<typeof TripRole>;

/**
 * Roles an invite may carry. Deliberately excludes `owner` and `organizer`: an invite can never
 * grant console authority (ADR-0007 "Invitations", ADR-0009). Enforced here by type and by a
 * test in apps/api-worker/test/invites.test.ts.
 */
export const InviteRole = z.enum(['leader', 'traveler', 'guardian']).openapi('InviteRole');
export type InviteRole = z.infer<typeof InviteRole>;

export const Locale = z.enum(['ko', 'en']).openapi('Locale');
export type Locale = z.infer<typeof Locale>;

/** RFC 3339 UTC timestamp. */
export const Timestamp = z.iso.datetime().describe('RFC 3339 UTC.');
/** Calendar date, no time zone (trip days are local to the trip). */
export const CalendarDate = z.iso.date().describe('YYYY-MM-DD, local to the trip.');
