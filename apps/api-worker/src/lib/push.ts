// Copyright 2026- At Day. All rights reserved.
//
// The push run (D29, slice 088). The notification rows are the queue: every priority or normal
// row due by now that no run has taken goes to each live phone of its recipient (a device whose
// session is neither revoked nor expired, so a remote wipe stops push at once), then the row is
// marked with what happened. Normal rows held by quiet hours become due when they end and go on
// the next run (the cron, every ten minutes); a route that wrote rows runs it for its own
// organization at once. A row more than six hours late is marked stale and not sent: a head
// count call from this morning is noise tonight. A dead token is forgotten. Never throws into a
// route; never logs a token.

import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { organizations, pushDevices, sessions } from '../db/schema';
import type { Bindings } from '../env';
import { orgObject } from '../org/client';
import { createPushPort, type PushPort, type PushResult } from '../push/PushPort';

export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export type PushRun = {
  organizations: number;
  rows: number;
  sent: number;
  noDevice: number;
  stale: number;
  failed: number;
  unconfigured: number;
  invalidTokens: number;
};

export async function runPushes(
  env: Bindings,
  now: string,
  options: { port?: PushPort; orgId?: string } = {},
): Promise<PushRun> {
  const run: PushRun = {
    organizations: 0,
    rows: 0,
    sent: 0,
    noDevice: 0,
    stale: 0,
    failed: 0,
    unconfigured: 0,
    invalidTokens: 0,
  };
  const port = options.port ?? createPushPort(env);
  const d = db(env.DB);
  const orgIds = options.orgId
    ? [options.orgId]
    : (
        await d
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.status, 'active'))
          .all()
      ).map((o) => o.id);
  for (const orgId of orgIds) {
    try {
      const org = await orgObject(env, orgId);
      const due = await org.duePushes(now);
      if (due.length === 0) continue;
      run.organizations += 1;
      const accountIds = [
        ...new Set(due.map((r) => r.accountId).filter((a): a is string => a !== null)),
      ];
      const devices =
        accountIds.length === 0
          ? []
          : await d
              .select({
                accountId: pushDevices.accountId,
                platform: pushDevices.platform,
                token: pushDevices.token,
                apnsEnvironment: pushDevices.apnsEnvironment,
              })
              .from(pushDevices)
              .innerJoin(sessions, eq(sessions.id, pushDevices.sessionId))
              .where(
                and(
                  inArray(pushDevices.accountId, accountIds),
                  isNull(sessions.revokedAt),
                  gt(sessions.expiresAt, now),
                ),
              )
              .all();
      const outcomes = new Map<string, string[]>();
      const mark = (outcome: string, id: string) => {
        const list = outcomes.get(outcome) ?? [];
        list.push(id);
        outcomes.set(outcome, list);
      };
      const dead = new Set<string>();
      for (const row of due) {
        if (Date.parse(now) - Date.parse(row.deliverAt) > STALE_AFTER_MS) {
          run.stale += 1;
          mark('stale', row.id);
          continue;
        }
        const mine = devices.filter((x) => x.accountId === row.accountId && !dead.has(x.token));
        if (mine.length === 0) {
          run.noDevice += 1;
          mark('no-device', row.id);
          continue;
        }
        const results: PushResult[] = [];
        for (const device of mine) {
          const result = await port.send({
            platform: device.platform,
            token: device.token,
            apnsEnvironment: device.apnsEnvironment ?? null,
            lane: row.lane,
            title: row.title,
            body: row.body,
            data: {
              notificationId: row.id,
              tripId: row.tripId,
              kind: row.kind,
              refType: row.refType,
              refId: row.refId,
            },
          });
          results.push(result);
          if (result === 'invalid-token') dead.add(device.token);
        }
        if (results.includes('sent')) {
          run.sent += 1;
          mark('sent', row.id);
        } else if (results.every((r) => r === 'unconfigured')) {
          run.unconfigured += 1;
          mark('unconfigured', row.id);
        } else if (results.every((r) => r === 'invalid-token')) {
          run.noDevice += 1;
          mark('no-device', row.id);
        } else {
          run.failed += 1;
          mark('failed', row.id);
        }
      }
      for (const [outcome, ids] of outcomes) run.rows += await org.markPushed(ids, now, outcome);
      if (dead.size > 0) {
        await d.delete(pushDevices).where(inArray(pushDevices.token, [...dead]));
        run.invalidTokens += dead.size;
      }
    } catch (e) {
      run.failed += 1;
      console.error('push run failed for organization', orgId, e instanceof Error ? e.message : e);
    }
  }
  return run;
}
