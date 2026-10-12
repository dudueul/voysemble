// Copyright 2026- At Day. All rights reserved.
//
// The one call the routes make when something happened that people on the trip should hear
// about (D29, slice 052): it reads the organization's quiet hours and digest hour from D1, takes
// the trip's zone, and lets the organization object fan the event out into its lanes. Never
// throws into the route: a failure to notify must not undo the thing that happened.

import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { organizations } from '../db/schema';
import type { OrgDurableObject } from '../org/OrgDurableObject';
import type { AudienceRole, LaneFlags, NotificationKind } from './notification-rules';
import { nowIso } from './time';

export type NotifyInput = {
  kind: NotificationKind;
  title: string;
  body: string;
  refType: 'announcement' | 'headcount' | 'incident' | 'proposal';
  refId: string;
  flags?: LaneFlags;
  audience: {
    roles?: AudienceRole[];
    groupNames?: string[];
    participationIds?: string[];
    guardiansOf?: string[];
  };
};

/** The first hundred and forty characters, on one line: a notification body, not the whole text. */
export function notificationBody(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}

export async function notifyTrip(
  env: Env,
  org: DurableObjectStub<OrgDurableObject>,
  orgId: string,
  trip: { id: string; timezone: string },
  input: NotifyInput,
): Promise<void> {
  try {
    const settings = await db(env.DB)
      .select({
        quietFrom: organizations.quietFrom,
        quietTo: organizations.quietTo,
        digestAt: organizations.digestAt,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .get();
    await org.notify({
      tripId: trip.id,
      ...input,
      now: nowIso(),
      timeZone: trip.timezone,
      quietHours: { from: settings?.quietFrom ?? '23:00', to: settings?.quietTo ?? '06:30' },
      digestAt: settings?.digestAt ?? '19:00',
    });
  } catch (e) {
    console.error('notify failed', input.kind, input.refId, e instanceof Error ? e.message : e);
  }
}
