// Copyright 2026- At Day. All rights reserved.
//
// The guardian digest run (D29, slice 054). The cron calls it: for every active organization,
// the digest-lane rows due by now that no email has carried yet, one email per recipient and
// trip through the EmailPort, then the rows are marked. A recipient who has not joined (no
// account) is skipped and marked: the rows stay in the inbox for when they do. A send that fails
// leaves the rows for the next run. One organization's failure never stops the others. The rows
// themselves are the queue; there is no second store to drift from.

import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { accounts, organizations } from '../db/schema';
import { createEmailPort, type EmailPort } from '../email/EmailPort';
import { digestEmail } from '../email/templates';
import { orgObject } from '../org/client';

export type DigestRun = {
  /** Organizations with at least one due row. */
  organizations: number;
  /** Emails sent. */
  emails: number;
  /** Rows marked (sent or skipped). */
  rows: number;
  /** Recipient groups without an account (marked, not sent). */
  skipped: number;
  /** Sends that failed (rows left for the next run). */
  failed: number;
};

export async function runDigests(
  env: Env,
  now: string,
  port: EmailPort = createEmailPort(env),
): Promise<DigestRun> {
  const run: DigestRun = { organizations: 0, emails: 0, rows: 0, skipped: 0, failed: 0 };
  const orgs = await db(env.DB)
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.status, 'active'))
    .all();
  for (const o of orgs) {
    try {
      const org = await orgObject(env, o.id);
      const due = await org.dueDigests(now);
      if (due.length === 0) continue;
      run.organizations += 1;
      const accountIds = [
        ...new Set(due.map((d) => d.accountId).filter((a): a is string => a !== null)),
      ];
      const rows =
        accountIds.length === 0
          ? []
          : await db(env.DB)
              .select({ id: accounts.id, email: accounts.email, locale: accounts.locale })
              .from(accounts)
              .where(inArray(accounts.id, accountIds))
              .all();
      const byId = new Map(rows.map((a) => [a.id, a]));
      for (const d of due) {
        const acct = d.accountId ? byId.get(d.accountId) : undefined;
        const ids = d.items.map((i) => i.id);
        if (!acct) {
          run.skipped += 1;
          run.rows += await org.markDigested(ids, now, 'skipped');
          continue;
        }
        try {
          await port.send(
            digestEmail(
              acct.email,
              acct.locale === 'ko' ? 'ko' : 'en',
              o.name,
              d.tripName,
              d.timeZone,
              d.items,
            ),
          );
        } catch (e) {
          run.failed += 1;
          console.error(
            'digest send failed',
            o.id,
            d.participationId,
            e instanceof Error ? e.message : e,
          );
          continue;
        }
        run.emails += 1;
        run.rows += await org.markDigested(ids, now, 'emailed');
      }
    } catch (e) {
      run.failed += 1;
      console.error('digest run failed for organization', o.id, e instanceof Error ? e.message : e);
    }
  }
  return run;
}
