// Copyright 2026- At Day. All rights reserved.
//
// Slice 076: the owners and organizers of an organization have no app, so what needs them at
// once reaches their mailbox: one message per account through the EmailPort, in the account's
// language. Never throws into the route: a failure to send is logged (never the address or the
// body) and the thing that happened stands.

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { accounts, memberships, organizations } from '../db/schema';
import { createEmailPort, type OutboundEmail } from '../email/EmailPort';

export type OrganizerRecipient = {
  email: string;
  locale: 'ko' | 'en';
  organizationName: string;
};

/** Every owner and organizer of the organization, with their language and the organization's name. */
export async function organizerRecipients(env: Env, orgId: string): Promise<OrganizerRecipient[]> {
  const rows = await db(env.DB)
    .select({
      email: accounts.email,
      locale: accounts.locale,
      organizationName: organizations.name,
    })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(
      and(eq(memberships.organizationId, orgId), inArray(memberships.role, ['owner', 'organizer'])),
    )
    .all();
  return rows.map((r) => ({
    email: r.email,
    locale: r.locale === 'ko' ? 'ko' : 'en',
    organizationName: r.organizationName,
  }));
}

/** One message per owner and organizer, composed for each; answers how many went. Never throws. */
export async function emailOrganizers(
  env: Env,
  orgId: string,
  compose: (recipient: OrganizerRecipient) => OutboundEmail,
): Promise<number> {
  let sent = 0;
  try {
    const port = createEmailPort(env);
    for (const recipient of await organizerRecipients(env, orgId)) {
      try {
        await port.send(compose(recipient));
        sent += 1;
      } catch (e) {
        console.error('organizer email failed', e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error('organizer emails failed', e instanceof Error ? e.message : e);
  }
  return sent;
}
