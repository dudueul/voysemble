// Copyright 2026- At Day. All rights reserved.
//
// Roster import, roster listing, invite issuing, invite redemption (D12, D21, D26, ADR-0007).
//
// Flow: organizer imports CSV -> participations in OrgDO -> organizer issues invite codes
// (hashes in D1, plaintext shown once) -> invitee signs in (any method) and redeems -> membership
// row in D1 + participation bound to the account in OrgDO.
//
// Invariant: an invite never grants `owner` or `organizer`. The org role granted on redeem is
// `leader` for leader invites and `member` otherwise, and the InviteRole enum cannot express
// anything else.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  AddLeaderRequest,
  type IssuedInvite,
  IssueInvitesResponse,
  Participation,
  RedeemInviteRequest,
  RedeemInviteResponse,
  RosterImportRequest,
  RosterImportResponse,
  RosterResponse,
} from '@voysemble/contracts';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { requireAuth, requireOrgRole } from '../auth/middleware';
import { db } from '../db/client';
import { inviteCodes, memberships, organizations } from '../db/schema';
import type { AppEnv } from '../env';
import { CsvError, parseCsv } from '../lib/csv';
import { isPast, nowIso, plusSeconds, SECONDS } from '../lib/time';
import { hashInviteCode, randomInviteCode } from '../lib/tokens';
import { orgObject } from '../org/client';
import type { RosterRowInput } from '../org/OrgDurableObject';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

export const INVITE_TTL_SECONDS = 30 * SECONDS.day;

const importRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/roster/import',
  tags: ['roster'],
  summary: 'Import roster rows from CSV (owner or organizer)',
  description:
    'Columns: name (required), group, guardian_name, guardian_contact. One traveler participation per row; a guardian participation bound to the traveler when guardian_name is present. guardian_contact is used for the invite email only and is not stored.',
  security: SESSION_SECURITY,
  request: {
    params: TripParams,
    body: { content: { 'application/json': { schema: RosterImportRequest } } },
  },
  responses: {
    201: {
      description: 'Imported.',
      content: { 'application/json': { schema: RosterImportResponse } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const listRosterRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/roster',
  tags: ['roster'],
  summary: 'Roster of a trip (owner, organizer, leader)',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: {
      description: 'Participations.',
      content: { 'application/json': { schema: RosterResponse } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const addLeaderRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/roster/leaders',
  tags: ['roster'],
  summary: 'Add a leader to a trip by name (owner or organizer)',
  security: SESSION_SECURITY,
  request: {
    params: TripParams,
    body: { content: { 'application/json': { schema: AddLeaderRequest } } },
  },
  responses: {
    201: {
      description: 'Leader participation created.',
      content: { 'application/json': { schema: Participation } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const issueInvitesRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/invites',
  tags: ['roster'],
  summary: 'Issue invite codes for every unbound participation without a live code',
  description: 'Codes are returned once. Only their hashes are stored. Valid 30 days.',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    201: {
      description: 'Codes issued.',
      content: { 'application/json': { schema: IssueInvitesResponse } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const redeemRoute = createRoute({
  method: 'post',
  path: '/v1/invites/redeem',
  tags: ['roster'],
  summary: 'Join an organization and trip with an invite code',
  security: SESSION_SECURITY,
  request: { body: { content: { 'application/json': { schema: RedeemInviteRequest } } } },
  responses: {
    200: {
      description: 'Joined.',
      content: { 'application/json': { schema: RedeemInviteResponse } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
    500: ERROR_RESPONSES[500],
  },
});

/** Maps parsed CSV rows to roster inputs; rejects rows without a name. */
function rowsToRoster(csv: string): {
  rows: RosterRowInput[];
  skipped: { line: number; reason: string }[];
} {
  let parsed: ReturnType<typeof parseCsv>;
  try {
    parsed = parseCsv(csv);
  } catch (e) {
    throw new HTTPException(400, { message: e instanceof CsvError ? e.message : 'Bad CSV.' });
  }
  if (!parsed.header.includes('name')) {
    throw new HTTPException(400, { message: 'CSV needs a "name" column.' });
  }
  const skipped = [...parsed.rejected];
  const rows: RosterRowInput[] = [];
  for (const r of parsed.rows) {
    const displayName = (r.values.name ?? '').slice(0, 80);
    if (!displayName) {
      skipped.push({ line: r.line, reason: 'name is empty' });
      continue;
    }
    const groupName = (r.values.group ?? '').slice(0, 40) || null;
    const guardianName = (r.values.guardian_name ?? '').slice(0, 80) || null;
    rows.push({ displayName, groupName, guardianName });
  }
  return { rows, skipped };
}

export function mountRosterRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(importRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const { csv } = c.req.valid('json');
    const { rows, skipped } = rowsToRoster(csv);
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const participations = await org.importRoster(tripId, rows);
    return c.json({ created: participations.length, skipped, participations }, 201);
  });

  app.openapi(listRosterRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'leader');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    return c.json({ participations: await org.listRoster(tripId) }, 200);
  });

  app.openapi(addLeaderRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const { displayName, groupName } = c.req.valid('json');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    return c.json(await org.addLeader(tripId, displayName, groupName), 201);
  });

  app.openapi(issueInvitesRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const roster = await org.listRoster(tripId);
    const unbound = roster.filter((p) => !p.accountId);
    const d = db(c.env.DB);
    const now = nowIso();
    const live = unbound.length
      ? await d
          .select({
            participationId: inviteCodes.participationId,
            expiresAt: inviteCodes.expiresAt,
          })
          .from(inviteCodes)
          .where(
            and(
              inArray(
                inviteCodes.participationId,
                unbound.map((p) => p.id),
              ),
              isNull(inviteCodes.redeemedAt),
              isNull(inviteCodes.revokedAt),
            ),
          )
          .all()
      : [];
    const hasLive = new Set(
      live.filter((l) => !isPast(l.expiresAt, now)).map((l) => l.participationId),
    );
    const invites: IssuedInvite[] = [];
    const inserts = [];
    for (const p of unbound) {
      if (hasLive.has(p.id)) continue;
      const code = randomInviteCode();
      const expiresAt = plusSeconds(now, INVITE_TTL_SECONDS);
      inserts.push({
        codeHash: hashInviteCode(code),
        organizationId: orgId,
        tripId,
        participationId: p.id,
        role: p.role,
        createdBy: auth.accountId,
        createdAt: now,
        expiresAt,
      });
      invites.push({
        participationId: p.id,
        role: p.role,
        displayName: p.displayName,
        code,
        expiresAt,
      });
    }
    if (inserts.length) await d.insert(inviteCodes).values(inserts);
    return c.json({ invites }, 201);
  });

  app.openapi(redeemRoute, async (c) => {
    const auth = requireAuth(c);
    const { code } = c.req.valid('json');
    const d = db(c.env.DB);
    const codeHash = hashInviteCode(code);
    const invite = await d.query.inviteCodes.findFirst({
      where: eq(inviteCodes.codeHash, codeHash),
    });
    const now = nowIso();
    if (!invite || invite.revokedAt || isPast(invite.expiresAt, now)) {
      throw new HTTPException(404, { message: 'Invite code not found or expired.' });
    }
    if (invite.redeemedAt) {
      throw new HTTPException(409, { message: 'Invite code already used.' });
    }
    // Claim atomically; a second concurrent redeem of the same code loses here.
    const claimed = await d
      .update(inviteCodes)
      .set({ redeemedAt: now, redeemedBy: auth.accountId })
      .where(and(eq(inviteCodes.codeHash, codeHash), isNull(inviteCodes.redeemedAt)))
      .returning({ codeHash: inviteCodes.codeHash });
    if (claimed.length === 0)
      throw new HTTPException(409, { message: 'Invite code already used.' });

    const org = await orgObject(c.env, invite.organizationId);
    let participation: Participation;
    try {
      participation = await org.bindAccount(invite.participationId, auth.accountId);
    } catch {
      throw new HTTPException(409, { message: 'This roster row is already linked to an account.' });
    }

    // Org role from the invite role; never owner/organizer (see InviteRole in contracts).
    const orgRole = invite.role === 'leader' ? ('leader' as const) : ('member' as const);
    const existing = await d.query.memberships.findFirst({
      where: and(
        eq(memberships.accountId, auth.accountId),
        eq(memberships.organizationId, invite.organizationId),
      ),
    });
    if (!existing) {
      await d.insert(memberships).values({
        id: crypto.randomUUID(),
        accountId: auth.accountId,
        organizationId: invite.organizationId,
        role: orgRole,
        createdAt: now,
      });
    } else if (existing.role === 'member' && orgRole === 'leader') {
      await d.update(memberships).set({ role: 'leader' }).where(eq(memberships.id, existing.id));
    }
    const orgRow = await d.query.organizations.findFirst({
      where: eq(organizations.id, invite.organizationId),
    });
    return c.json(
      {
        organizationId: invite.organizationId,
        organizationName: orgRow?.name ?? '',
        tripId: invite.tripId,
        participation,
      },
      200,
    );
  });
}
