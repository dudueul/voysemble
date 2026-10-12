// Copyright 2026- At Day. All rights reserved.
//
// Packing reminders (D38, D29; slice 056). On the mornings three days and one day before a trip
// starts (the trip zone's date, from 09:00), everyone whose own packing list is not complete
// hears it in the normal lane: travelers and leaders about their own list, guardians about their
// traveler's, each with the count and the first missing items by name. The cron calls the run
// every ten minutes; the organization object writes a reminder once per person and morning
// (idempotent on the reference `packing:<startsOn>:<daysLeft>`), so the run is cheap to repeat.
// Words in the organization's language; a trip without items reminds nobody.

import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { organizations } from '../db/schema';
import { orgObject } from '../org/client';
import type { PackingReminderTarget } from '../org/OrgDurableObject';
import { localClock, plusDays } from './time';

/** The mornings a reminder goes out: three days before the start, and the day before. */
export const REMINDER_DAYS_LEFT = [3, 1] as const;
/** From this wall-clock time in the trip's zone. */
export const REMINDER_FROM = '09:00';

export type PackingReminderRun = {
  /** Trips on a reminder morning with items. */
  trips: number;
  /** Rows written. */
  reminders: number;
  /** Rows already there (or not for this role). */
  skipped: number;
  failed: number;
};

/** How many whole days from `date` to `startsOn` (negative once the trip has started). */
export function daysUntil(date: string, startsOn: string): number {
  return Math.round(
    (Date.parse(`${startsOn}T00:00:00.000Z`) - Date.parse(`${date}T00:00:00.000Z`)) / 86_400_000,
  );
}

export function reminderTitle(locale: 'ko' | 'en', daysLeft: number): string {
  if (locale === 'ko')
    return daysLeft === 1 ? '준비물: 출발 하루 전' : `준비물: 출발 ${daysLeft}일 전`;
  return daysLeft === 1 ? 'Packing: the trip starts tomorrow' : `Packing: ${daysLeft} days to go`;
}

/** "3 of 9 still to pack: EU plug adapter, Medication with doctor note, …" (at most three names). */
export function reminderBody(locale: 'ko' | 'en', t: PackingReminderTarget): string {
  const left = t.total - t.packed;
  const names =
    t.missing.slice(0, 3).join(', ') +
    (t.missing.length > 3 ? (locale === 'ko' ? ' 외' : ', …') : '');
  if (locale === 'ko') {
    const who = t.forTraveler ? `${t.forTraveler}의 준비물 ` : '';
    return `${who}${t.total}개 중 ${left}개가 아직 남았습니다: ${names}`;
  }
  const who = t.forTraveler ? `${t.forTraveler}'s list: ` : '';
  return `${who}${left} of ${t.total} still to pack: ${names}`;
}

export async function runPackingReminders(env: Env, now: string): Promise<PackingReminderRun> {
  const run: PackingReminderRun = { trips: 0, reminders: 0, skipped: 0, failed: 0 };
  const orgs = await db(env.DB)
    .select({
      id: organizations.id,
      defaultLocale: organizations.defaultLocale,
      quietFrom: organizations.quietFrom,
      quietTo: organizations.quietTo,
      digestAt: organizations.digestAt,
    })
    .from(organizations)
    .where(eq(organizations.status, 'active'))
    .all();
  for (const o of orgs) {
    try {
      const org = await orgObject(env, o.id);
      const locale = o.defaultLocale === 'en' ? 'en' : 'ko';
      for (const trip of await org.listTrips()) {
        const { date, time } = localClock(now, trip.timezone);
        const daysLeft = daysUntil(date, trip.startsOn);
        if (!REMINDER_DAYS_LEFT.includes(daysLeft as 3 | 1) || time < REMINDER_FROM) continue;
        const targets = await org.packingReminderTargets(trip.id);
        if (targets.length === 0) continue;
        run.trips += 1;
        const r = await org.notifyRows({
          tripId: trip.id,
          kind: 'packing_reminder',
          title: reminderTitle(locale, daysLeft),
          refType: 'packing',
          refId: `packing:${trip.startsOn}:${daysLeft}`,
          rows: targets.map((t) => ({
            participationId: t.participationId,
            body: reminderBody(locale, t),
          })),
          now,
          timeZone: trip.timezone,
          quietHours: { from: o.quietFrom, to: o.quietTo },
          digestAt: o.digestAt,
        });
        if ('notFound' in r) continue;
        run.reminders += r.written;
        run.skipped += r.skipped;
      }
    } catch (e) {
      run.failed += 1;
      console.error(
        'packing reminders failed for organization',
        o.id,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return run;
}

/** Exported for the tests that pin the calendar rule without a clock. */
export const _internal = { plusDays };
