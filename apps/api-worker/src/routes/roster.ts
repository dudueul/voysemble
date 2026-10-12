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
  type InviteStatus,
  type IssuedInvite,
  IssueInvitesResponse,
  Participation,
  RedeemInviteRequest,
  RedeemInviteResponse,
  RemoveParticipationResponse,
  RevokeDevicesResponse,
  RevokeInviteResponse,
  type RosterEntry,
  RosterImportRequest,
  RosterImportResponse,
  RosterResponse,
  UpdateParticipationRequest,
} from '@voysemble/contracts';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth, requireOrgRole } from '../auth/middleware';
import { revokeSessions } from '../auth/service';
import { db } from '../db/client';
import { inviteCodes, memberships, organizations } from '../db/schema';
import type { AppEnv } from '../env';
import { CsvError, parseCsv } from '../lib/csv';
import { clientIp, enforceLimits } from '../lib/rate-limit';
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
  description:
    'Each row carries its invite status (none, issued, expired, joined) computed from the invite codes and the account binding, and the receipt time of the person’s latest acknowledgment.',
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

const RowParams = TripParams.extend({ participationId: z.uuid() });

const updateRowRoute = createRoute({
  method: 'patch',
  path: '/v1/orgs/{orgId}/trips/{tripId}/roster/{participationId}',
  tags: ['roster'],
  summary: 'Rename or regroup a roster row (owner or organizer); role and binding never change',
  security: SESSION_SECURITY,
  request: {
    params: RowParams,
    body: { content: { 'application/json': { schema: UpdateParticipationRequest } } },
  },
  responses: {
    200: { description: 'The row.', content: { 'application/json': { schema: Participation } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const removeRowRoute = createRoute({
  method: 'delete',
  path: '/v1/orgs/{orgId}/trips/{tripId}/roster/{participationId}',
  tags: ['roster'],
  summary:
    'Remove a row nobody joined, with the guardians bound to a traveler; revokes their codes',
  description:
    'Refused (409) when the row or a bound guardian already joined: a person who joined is revoked, never erased.',
  security: SESSION_SECURITY,
  request: { params: RowParams },
  responses: {
    200: {
      description: 'Removed ids.',
      content: { 'application/json': { schema: RemoveParticipationResponse } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
    500: ERROR_RESPONSES[500],
  },
});

const revokeInviteRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/roster/{participationId}/revoke-invite',
  tags: ['roster'],
  summary: "Revoke a row's live invite codes; the next issue mints a new one",
  description: "Refused (409) once the row joined: revoke the person's devices instead (D28).",
  security: SESSION_SECURITY,
  request: { params: RowParams },
  responses: {
    200: {
      description: 'Count revoked.',
      content: { 'application/json': { schema: RevokeInviteResponse } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
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
    429: ERROR_RESPONSES[429],
    500: ERROR_RESPONSES[500],
  },
});

/**
 * Invite status of one roster row from its account binding and its codes (slice 023). Redeemed
 * and revoked codes do not count; a live (unexpired) open code wins over expired ones.
 */
export function inviteStatusOf(
  accountId: string | null,
  codes: { expiresAt: string; redeemedAt: string | null; revokedAt: string | null }[],
  now: string,
): InviteStatus {
  if (accountId) return 'joined';
  const open = codes.filter((c) => !c.redeemedAt && !c.revokedAt);
  if (open.some((c) => !isPast(c.expiresAt, now))) return 'issued';
  if (open.length > 0) return 'expired';
  return 'none';
}

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

const revokeDevicesRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/roster/{participationId}/revoke-devices',
  tags: ['roster'],
  summary: 'Lost or stolen device: sign out every phone of this person and issue a new code (D28)',
  description:
    "Owner or organizer. Revokes every session of the account behind a joined row (phone and browser, except the caller's own) with the wipe directive (the phone's next request is 401 with X-Voysemble-Wipe: 1 and the app clears itself), unbinds the row so it reads as invited again, revokes open codes and mints a fresh one. 409 when nobody joined the row. The person re-enrols with the new code; group and role stay on the row.",
  security: SESSION_SECURITY,
  request: { params: RowParams },
  responses: {
    200: {
      description: 'Sessions revoked and the new code (shown once).',
      content: { 'application/json': { schema: RevokeDevicesResponse } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
    500: ERROR_RESPONSES[500],
  },
});

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
    const roster = await org.listRosterWithAcks(tripId);
    // Codes by trip (one query, no bound-parameter list): D1 caps parameters per statement.
    const codes = await db(c.env.DB)
      .select({
        participationId: inviteCodes.participationId,
        expiresAt: inviteCodes.expiresAt,
        redeemedAt: inviteCodes.redeemedAt,
        revokedAt: inviteCodes.revokedAt,
      })
      .from(inviteCodes)
      .where(eq(inviteCodes.tripId, tripId))
      .all();
    const byRow = new Map<string, typeof codes>();
    for (const code of codes) {
      const list = byRow.get(code.participationId) ?? [];
      list.push(code);
      byRow.set(code.participationId, list);
    }
    const now = nowIso();
    const participations: RosterEntry[] = roster.map((p) => ({
      ...p,
      invite: inviteStatusOf(p.accountId, byRow.get(p.id) ?? [], now),
    }));
    return c.json({ participations }, 200);
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

  /** Revoke every open code of the given rows (D1); returns how many. */
  const revokeCodes = async (env: AppEnv['Bindings'], ids: string[], now: string) => {
    if (ids.length === 0) return 0;
    const d = db(env.DB);
    const open = await d
      .select({ codeHash: inviteCodes.codeHash })
      .from(inviteCodes)
      .where(
        and(
          inArray(inviteCodes.participationId, ids),
          isNull(inviteCodes.redeemedAt),
          isNull(inviteCodes.revokedAt),
        ),
      )
      .all();
    for (const row of open) {
      await d
        .update(inviteCodes)
        .set({ revokedAt: now })
        .where(eq(inviteCodes.codeHash, row.codeHash));
    }
    return open.length;
  };

  app.openapi(revokeDevicesRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, participationId } = c.req.valid('param');
    const access = await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const now = nowIso();
    const me = await org.participationForAccount(tripId, auth.accountId);
    const byName = me?.displayName ?? (access.role === 'owner' ? 'Owner' : 'Organizer');
    const unbound = await org.unbindAccount(tripId, participationId, byName, now);
    if ('notFound' in unbound) throw new HTTPException(404, { message: 'Person not found.' });
    if ('notJoined' in unbound)
      throw new HTTPException(409, {
        message: 'Nobody has joined this row; revoke its code instead.',
      });
    const d = db(c.env.DB);
    const revokedSessions = await revokeSessions(d, unbound.accountId, auth.sessionId, now);
    await revokeCodes(c.env, [participationId], now);
    const row = await org.getParticipation(participationId);
    if (!row) throw new HTTPException(404, { message: 'Person not found.' });
    const code = randomInviteCode();
    const expiresAt = plusSeconds(now, INVITE_TTL_SECONDS);
    await d.insert(inviteCodes).values({
      codeHash: hashInviteCode(code),
      organizationId: orgId,
      tripId,
      participationId,
      role: row.role as 'leader' | 'traveler' | 'guardian',
      createdBy: auth.accountId,
      createdAt: now,
      expiresAt,
    });
    return c.json(
      {
        revokedSessions,
        invite: { participationId, role: row.role, displayName: row.displayName, code, expiresAt },
      },
      200,
    );
  });

  app.openapi(updateRowRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, participationId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const r = await org.updateParticipation(tripId, participationId, c.req.valid('json'));
    if ('notFound' in r) throw new HTTPException(404, { message: 'Person not found.' });
    return c.json(r, 200);
  });

  app.openapi(removeRowRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, participationId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const r = await org.removeParticipation(tripId, participationId);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Person not found.' });
    if ('joined' in r) {
      throw new HTTPException(409, {
        message:
          'Someone on this row already joined; revoke their devices instead of removing the row.',
      });
    }
    await revokeCodes(c.env, r.removed, nowIso());
    return c.json({ removed: r.removed }, 200);
  });

  app.openapi(revokeInviteRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, participationId } = c.req.valid('param');
    await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    const person = await org.getParticipation(participationId);
    if (!person || person.tripId !== tripId)
      throw new HTTPException(404, { message: 'Person not found.' });
    if (person.accountId)
      throw new HTTPException(409, { message: 'Already joined; revoke devices instead.' });
    return c.json({ revoked: await revokeCodes(c.env, [participationId], nowIso()) }, 200);
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
    // Slice 041: ten codes per account per hour, thirty per caller address; a code is guessable only in theory.
    await enforceLimits(c, [
      { scope: 'redeemAccount', subject: auth.accountId },
      { scope: 'redeemIp', subject: clientIp(c) },
    ]);
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
