// Copyright 2026- At Day. All rights reserved.
//
// Organizer invitations (slice 042, D33). An owner invites a colleague by email from the console:
// the emailed link carries a one-time token (only its hash is stored; seven days), and the
// signed-in account that carries the invited address accepts it and becomes an organizer (a
// leader or member is raised; an owner or organizer stays). Invite codes (routes/roster.ts)
// remain the way leaders, travelers and guardians join and never grant console authority.
// Lists show pending, accepted, expired and revoked; the owner revokes a pending one; inviting
// an address again revokes its earlier pending invitation so only the newest link works.

import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AcceptInvitationRequest,
  AcceptInvitationResponse,
  CreateOrganizerInvitationRequest,
  Id,
  type InvitationStatus,
  OrganizerInvitation,
  OrganizerInvitationList,
  type OrgRole,
} from '@voysemble/contracts';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { requireAuth, requireOrgRole } from '../auth/middleware';
import { db } from '../db/client';
import { accounts, memberships, organizationInvitations, organizations } from '../db/schema';
import { createEmailPort } from '../email/EmailPort';
import { organizerInvitationEmail } from '../email/templates';
import type { AppEnv } from '../env';
import { enforceLimits } from '../lib/rate-limit';
import { isPast, nowIso, plusSeconds, SECONDS } from '../lib/time';
import { hashToken, randomToken } from '../lib/tokens';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';

/** An invitation link works for seven days (D33). */
export const INVITATION_TTL_SECONDS = 7 * SECONDS.day;

const OrgParams = z.object({ orgId: Id });
const InvitationParams = z.object({ orgId: Id, invitationId: Id });

const createInvitationRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/invitations',
  tags: ['organizations'],
  summary: 'Email an organizer invitation (owner)',
  description:
    'Slice 042 (D33). Owner only. Sends a one-time link, valid seven days, to the address; the account that accepts must sign in with that address. An address that already owns or organizes the organization is 409. An earlier pending invitation to the same address is revoked. Twenty per organization per hour (429).',
  security: SESSION_SECURITY,
  request: {
    params: OrgParams,
    body: { content: { 'application/json': { schema: CreateOrganizerInvitationRequest } } },
  },
  responses: {
    201: {
      description: 'Sent.',
      content: { 'application/json': { schema: OrganizerInvitation } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    409: ERROR_RESPONSES[409],
    429: ERROR_RESPONSES[429],
    500: ERROR_RESPONSES[500],
  },
});

const listInvitationsRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/invitations',
  tags: ['organizations'],
  summary: 'Organizer invitations of the organization, newest first (owner, organizer)',
  security: SESSION_SECURITY,
  request: { params: OrgParams },
  responses: {
    200: {
      description: 'Pending, accepted, expired and revoked invitations.',
      content: { 'application/json': { schema: OrganizerInvitationList } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    500: ERROR_RESPONSES[500],
  },
});

const revokeInvitationRoute = createRoute({
  method: 'delete',
  path: '/v1/orgs/{orgId}/invitations/{invitationId}',
  tags: ['organizations'],
  summary: 'Revoke a pending organizer invitation (owner); its link stops working',
  description:
    'Idempotent on an invitation already revoked. An accepted invitation cannot be revoked (409): remove the membership instead, when that exists.',
  security: SESSION_SECURITY,
  request: { params: InvitationParams },
  responses: {
    200: {
      description: 'The invitation, revoked.',
      content: { 'application/json': { schema: OrganizerInvitation } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
    500: ERROR_RESPONSES[500],
  },
});

const acceptInvitationRoute = createRoute({
  method: 'post',
  path: '/v1/invitations/accept',
  tags: ['organizations'],
  summary: 'Accept an organizer invitation with the token from the emailed link',
  description:
    'The signed-in account must carry the invited address (403 otherwise). 404 when the token is unknown, revoked or expired; 409 when already accepted. The account becomes an organizer; a leader or member is raised, an owner stays owner.',
  security: SESSION_SECURITY,
  request: { body: { content: { 'application/json': { schema: AcceptInvitationRequest } } } },
  responses: {
    200: {
      description: 'Joined.',
      content: { 'application/json': { schema: AcceptInvitationResponse } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
    500: ERROR_RESPONSES[500],
  },
});

type InvitationRow = typeof organizationInvitations.$inferSelect;

/** Accepted and revoked are facts on the row; expiry is read against the clock. */
export function invitationStatusOf(
  row: Pick<InvitationRow, 'acceptedAt' | 'revokedAt' | 'expiresAt'>,
  now: string,
): InvitationStatus {
  if (row.acceptedAt) return 'accepted';
  if (row.revokedAt) return 'revoked';
  if (isPast(row.expiresAt, now)) return 'expired';
  return 'pending';
}

function invitationOf(row: InvitationRow, invitedBy: string, now: string) {
  return {
    id: row.id,
    email: row.email,
    role: 'organizer' as const,
    status: invitationStatusOf(row, now),
    invitedBy,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    revokedAt: row.revokedAt,
  };
}

const NOT_VALID = 'This invitation is not valid any more.';

export function mountInvitationRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(createInvitationRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId } = c.req.valid('param');
    const access = await requireOrgRole(c.env, auth, orgId, 'owner');
    const body = c.req.valid('json');
    const email = body.email.toLowerCase();
    const d = db(c.env.DB);
    // An address that already organizes needs no invitation; a leader's or member's is raised on accept.
    const existing = await d
      .select({ role: memberships.role })
      .from(memberships)
      .innerJoin(accounts, eq(accounts.id, memberships.accountId))
      .where(and(eq(memberships.organizationId, orgId), eq(accounts.email, email)))
      .get();
    if (existing && (existing.role === 'owner' || existing.role === 'organizer')) {
      throw new HTTPException(409, { message: 'This address already organizes the organization.' });
    }
    // Each invitation sends an email on the organization's behalf: twenty per hour (slice 041).
    await enforceLimits(c, [{ scope: 'organizerInviteOrg', subject: orgId }]);
    const orgRow = await d
      .select({ defaultLocale: organizations.defaultLocale })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .get();
    const locale: 'ko' | 'en' = body.locale ?? (orgRow?.defaultLocale === 'en' ? 'en' : 'ko');
    const now = nowIso();
    // Only the newest link to an address works: earlier pending invitations are revoked.
    await d
      .update(organizationInvitations)
      .set({ revokedAt: now })
      .where(
        and(
          eq(organizationInvitations.organizationId, orgId),
          eq(organizationInvitations.email, email),
          isNull(organizationInvitations.acceptedAt),
          isNull(organizationInvitations.revokedAt),
        ),
      );
    const token = randomToken();
    const row: InvitationRow = {
      id: crypto.randomUUID(),
      organizationId: orgId,
      email,
      role: 'organizer',
      tokenHash: hashToken(token),
      locale,
      invitedBy: auth.accountId,
      createdAt: now,
      expiresAt: plusSeconds(now, INVITATION_TTL_SECONDS),
      acceptedAt: null,
      acceptedBy: null,
      revokedAt: null,
    };
    await d.insert(organizationInvitations).values(row);
    // The console's accept page reads the fragment; it never reaches server logs (as the magic link).
    const url = `${new URL(c.req.url).origin}/invitations/accept#token=${token}`;
    await createEmailPort(c.env).send(
      organizerInvitationEmail(email, locale, access.organizationName, url),
    );
    return c.json(invitationOf(row, auth.email, now), 201);
  });

  app.openapi(listInvitationsRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const rows = await db(c.env.DB)
      .select({ row: organizationInvitations, invitedBy: accounts.email })
      .from(organizationInvitations)
      .innerJoin(accounts, eq(accounts.id, organizationInvitations.invitedBy))
      .where(eq(organizationInvitations.organizationId, orgId))
      .orderBy(desc(organizationInvitations.createdAt), desc(organizationInvitations.id))
      .all();
    const now = nowIso();
    return c.json({ invitations: rows.map((r) => invitationOf(r.row, r.invitedBy, now)) }, 200);
  });

  app.openapi(revokeInvitationRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, invitationId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'owner');
    const d = db(c.env.DB);
    const found = await d
      .select({ row: organizationInvitations, invitedBy: accounts.email })
      .from(organizationInvitations)
      .innerJoin(accounts, eq(accounts.id, organizationInvitations.invitedBy))
      .where(
        and(
          eq(organizationInvitations.id, invitationId),
          eq(organizationInvitations.organizationId, orgId),
        ),
      )
      .get();
    if (!found) throw new HTTPException(404, { message: 'Invitation not found.' });
    if (found.row.acceptedAt) {
      throw new HTTPException(409, { message: 'This invitation was already accepted.' });
    }
    const now = nowIso();
    let row = found.row;
    if (!row.revokedAt) {
      await d
        .update(organizationInvitations)
        .set({ revokedAt: now })
        .where(eq(organizationInvitations.id, invitationId));
      row = { ...row, revokedAt: now };
    }
    return c.json(invitationOf(row, found.invitedBy, now), 200);
  });

  app.openapi(acceptInvitationRoute, async (c) => {
    const auth = requireAuth(c);
    const { token } = c.req.valid('json');
    const d = db(c.env.DB);
    const now = nowIso();
    const found = await d
      .select({
        row: organizationInvitations,
        organizationName: organizations.name,
        organizationStatus: organizations.status,
      })
      .from(organizationInvitations)
      .innerJoin(organizations, eq(organizations.id, organizationInvitations.organizationId))
      .where(eq(organizationInvitations.tokenHash, hashToken(token)))
      .get();
    // Unknown, revoked, expired and a closed organization are one answer: nothing to learn.
    if (
      !found ||
      found.row.revokedAt ||
      isPast(found.row.expiresAt, now) ||
      found.organizationStatus !== 'active'
    ) {
      throw new HTTPException(404, { message: NOT_VALID });
    }
    if (found.row.email !== auth.email.toLowerCase()) {
      throw new HTTPException(403, { message: 'This invitation was sent to another address.' });
    }
    if (found.row.acceptedAt) {
      throw new HTTPException(409, { message: 'This invitation was already accepted.' });
    }
    // Claim first: a concurrent second accept must lose (one statement, atomic in D1).
    const claimed = await d
      .update(organizationInvitations)
      .set({ acceptedAt: now, acceptedBy: auth.accountId })
      .where(
        and(
          eq(organizationInvitations.id, found.row.id),
          isNull(organizationInvitations.acceptedAt),
          isNull(organizationInvitations.revokedAt),
        ),
      )
      .returning({ id: organizationInvitations.id });
    if (claimed.length === 0) {
      throw new HTTPException(409, { message: 'This invitation was already accepted.' });
    }
    const orgId = found.row.organizationId;
    const membership = await d
      .select({ id: memberships.id, role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.accountId, auth.accountId), eq(memberships.organizationId, orgId)))
      .get();
    let role: OrgRole = 'organizer';
    let alreadyMember = false;
    if (!membership) {
      await d.insert(memberships).values({
        id: crypto.randomUUID(),
        accountId: auth.accountId,
        organizationId: orgId,
        role: 'organizer',
        createdAt: now,
      });
    } else if (membership.role === 'owner' || membership.role === 'organizer') {
      role = membership.role;
      alreadyMember = true;
    } else {
      await d
        .update(memberships)
        .set({ role: 'organizer' })
        .where(eq(memberships.id, membership.id));
    }
    return c.json(
      { organizationId: orgId, organizationName: found.organizationName, role, alreadyMember },
      200,
    );
  });
}
