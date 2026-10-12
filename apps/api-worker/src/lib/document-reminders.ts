// Copyright 2026- At Day. All rights reserved.
//
// Document reminders (D27, D29; slices 060 and 062). The words of the reminder (the route's
// nudge and the cron's share them) and the scheduled run: on the mornings three days and one day
// before a requirement's due date (the trip zone's date, from 09:00), every traveler still
// missing the document and the guardians bound to them hear it in the normal lane. One reminder
// per person and day, whatever its source: the reference carries the requirement and the date,
// and the organization object writes a row once (`notifyRows`), so the organizer's nudge that
// morning and the cron's run are the same reminder. A requirement without a due date is nudged
// by hand only.

import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { organizations } from '../db/schema';
import { orgObject } from '../org/client';
import type { OrgDurableObject } from '../org/OrgDurableObject';
import { daysUntil, REMINDER_DAYS_LEFT, REMINDER_FROM } from './packing-reminders';
import { localClock } from './time';

/** "Documents: Passport copy still needed" / "서류: 여권 사본이(가) 아직 필요합니다". */
export function documentReminderTitle(locale: 'ko' | 'en', name: string): string {
  return locale === 'ko'
    ? `서류: ${name}이(가) 아직 필요합니다`
    : `Documents: ${name} still needed`;
}

/** The body names the traveler and the due date; a guardian reads whose it is. */
export function documentReminderBody(
  locale: 'ko' | 'en',
  traveler: string,
  name: string,
  dueOn: string | null,
): string {
  if (locale === 'ko') {
    const due = dueOn ? ` 기한은 ${dueOn}입니다.` : '';
    return `${traveler}: ${name}이(가) 아직 제출되지 않았습니다.${due} 주최자나 인솔자에게 전달해 주세요.`;
  }
  const due = dueOn ? `, due ${dueOn}` : '';
  return `${traveler}: ${name} not handed in yet${due}. Give it to the organizer or a group leader.`;
}

/** The reference a reminder for a requirement carries on a date; the nudge and the cron share it. */
export function documentReminderRef(requirementId: string, date: string): string {
  return `document:${requirementId}:${date}`;
}

/**
 * The rows a reminder writes: one per traveler still missing the document, one per guardian
 * bound to such a traveler, each with the body that names the traveler.
 */
export async function documentReminderRows(
  org: DurableObjectStub<OrgDurableObject>,
  tripId: string,
  requirementId: string,
  locale: 'ko' | 'en',
): Promise<{
  name: string;
  missing: number;
  rows: { participationId: string; body: string }[];
} | null> {
  const list = await org.documentItems(tripId, requirementId);
  if ('notFound' in list) return null;
  const missing = list.items.filter((i) => i.state === 'missing');
  if (missing.length === 0) return { name: list.requirement.name, missing: 0, rows: [] };
  const roster = await org.listRoster(tripId);
  const rows: { participationId: string; body: string }[] = [];
  for (const item of missing) {
    const body = documentReminderBody(
      locale,
      item.displayName,
      list.requirement.name,
      list.requirement.dueOn,
    );
    rows.push({ participationId: item.participationId, body });
    for (const g of roster.filter(
      (p) => p.role === 'guardian' && p.guardianOf === item.participationId,
    )) {
      rows.push({ participationId: g.id, body });
    }
  }
  return { name: list.requirement.name, missing: missing.length, rows };
}

export type DocumentReminderRun = {
  /** Requirements on a reminder morning with something missing. */
  requirements: number;
  reminders: number;
  skipped: number;
  failed: number;
};

export async function runDocumentReminders(env: Env, now: string): Promise<DocumentReminderRun> {
  const run: DocumentReminderRun = { requirements: 0, reminders: 0, skipped: 0, failed: 0 };
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
        if (time < REMINDER_FROM) continue;
        const list = await org.listDocumentRequirements(trip.id);
        if ('notFound' in list) continue;
        for (const req of list.requirements) {
          if (!req.dueOn || req.counts.missing === 0) continue;
          const daysLeft = daysUntil(date, req.dueOn);
          if (!REMINDER_DAYS_LEFT.includes(daysLeft as 3 | 1)) continue;
          const r = await documentReminderRows(org, trip.id, req.id, locale);
          if (!r || r.rows.length === 0) continue;
          run.requirements += 1;
          const written = await org.notifyRows({
            tripId: trip.id,
            kind: 'document_reminder',
            title: documentReminderTitle(locale, r.name),
            refType: 'document',
            refId: documentReminderRef(req.id, date),
            rows: r.rows,
            now,
            timeZone: trip.timezone,
            quietHours: { from: o.quietFrom, to: o.quietTo },
            digestAt: o.digestAt,
          });
          if ('notFound' in written) continue;
          run.reminders += written.written;
          run.skipped += written.skipped;
        }
      }
    } catch (e) {
      run.failed += 1;
      console.error(
        'document reminders failed for organization',
        o.id,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return run;
}
