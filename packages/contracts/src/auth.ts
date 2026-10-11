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
    memberships: z.array(MembershipSummary),
  })
  .openapi('MeResponse');
export type MeResponse = z.infer<typeof MeResponse>;

export const LogoutResponse = z.object({ loggedOut: z.literal(true) }).openapi('LogoutResponse');
