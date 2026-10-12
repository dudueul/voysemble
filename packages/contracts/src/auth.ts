// Copyright 2026- At Day. All rights reserved.
//
// Authentication contracts: email magic link, session, current account. OIDC and native
// provider sign-in (ADR-0007) are added by later slices and reuse SessionResponse.

import { z } from '@hono/zod-openapi';
import { Id, Locale, OrgRole, Timestamp } from './common';

export const Email = z.email().max(254).describe('Lower-cased on the server.');

export const MagicLinkRequest = z
  .object({
    email: Email,
    locale: Locale.default('ko').describe('Language of the email body.'),
  })
  .openapi('MagicLinkRequest');
export type MagicLinkRequest = z.infer<typeof MagicLinkRequest>;

/** Always 202. The body never says whether the address is known (no account enumeration). */
export const MagicLinkAccepted = z
  .object({
    accepted: z.literal(true),
    expiresInSeconds: z.number().int().describe('Validity of the emailed token.'),
  })
  .openapi('MagicLinkAccepted');
export type MagicLinkAccepted = z.infer<typeof MagicLinkAccepted>;

export const SessionClient = z.enum(['web', 'native']).openapi('SessionClient');
export type SessionClient = z.infer<typeof SessionClient>;

export const MagicLinkVerifyRequest = z
  .object({
    token: z.string().min(32).max(128).describe('Opaque token from the emailed link.'),
    client: SessionClient.default('web').describe(
      'web: session set as HttpOnly cookie. native: session token returned in the body once.',
    ),
  })
  .openapi('MagicLinkVerifyRequest');
export type MagicLinkVerifyRequest = z.infer<typeof MagicLinkVerifyRequest>;

export const SessionResponse = z
  .object({
    accountId: Id,
    email: Email,
    isNewAccount: z.boolean(),
    expiresAt: Timestamp,
    /** Present only for `client: native`. Shown once; store in Keychain/Keystore. */
    sessionToken: z.string().optional(),
  })
  .openapi('SessionResponse');
export type SessionResponse = z.infer<typeof SessionResponse>;

export const MembershipSummary = z
  .object({
    organizationId: Id,
    organizationName: z.string(),
    role: OrgRole,
  })
  .openapi('MembershipSummary');
export type MembershipSummary = z.infer<typeof MembershipSummary>;

export const MeResponse = z
  .object({
    accountId: Id,
    email: Email,
    locale: Locale,
    /** Slice 069: the account's own name, shown wherever it acts on a trip; null until set. */
    displayName: z.string().nullable(),
    memberships: z.array(MembershipSummary),
  })
  .openapi('MeResponse');
export type MeResponse = z.infer<typeof MeResponse>;

/**
 * `PATCH /v1/me` (slice 038): the account's own language for the console and the emails it gets;
 * slice 069: the account's own name (1..80 characters; null clears it). Absent fields stay.
 */
export const UpdateMeRequest = z
  .object({
    locale: Locale.optional(),
    displayName: z.string().trim().min(1).max(80).nullable().optional(),
  })
  .openapi('UpdateMeRequest');
export type UpdateMeRequest = z.infer<typeof UpdateMeRequest>;

export const LogoutResponse = z.object({ loggedOut: z.literal(true) }).openapi('LogoutResponse');

/* ---------- Step-up reauthentication (D35, slice 045) ---------- */

/** How long a confirmation covers step-up actions (the scan reveal). */
export const REAUTH_WINDOW_SECONDS = 10 * 60;

/** `POST /v1/auth/reauth`: a one-time link goes to the signed-in account's own address. */
export const ReauthAccepted = z
  .object({ accepted: z.literal(true), expiresInSeconds: z.number().int() })
  .openapi('ReauthAccepted');
export type ReauthAccepted = z.infer<typeof ReauthAccepted>;

/** `POST /v1/auth/reauth/verify`: the token from that link, sent by the same session. */
export const ReauthVerifyRequest = z
  .object({ token: z.string().min(32).max(128).describe('Opaque token from the emailed link.') })
  .openapi('ReauthVerifyRequest');
export type ReauthVerifyRequest = z.infer<typeof ReauthVerifyRequest>;

export const ReauthResponse = z
  .object({ reauthedAt: Timestamp, validUntil: Timestamp })
  .openapi('ReauthResponse');
export type ReauthResponse = z.infer<typeof ReauthResponse>;
