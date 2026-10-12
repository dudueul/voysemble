// Copyright 2026- At Day. All rights reserved.
//
// Trip report (slice 034): the numbers an organizer wants during and after a trip, derived from
// facts the service already holds (announcements and acknowledgments, head counts, incidents,
// the fee ledger). Nothing is stored for it; the server composes it on request and the console
// renders it. Day indexes count from the trip's first day in the trip's time zone.

import { z } from '@hono/zod-openapi';
import { Timestamp } from './common';
import { DocumentSummary } from './documents';
import { Currency } from './fees';
import { HeadcountMissing } from './headcount';

export const ReportDay = z
  .object({
    /** 1 on the trip's first day; 0 or negative before it, past the end after it. */
    day: z.number().int(),
    /** YYYY-MM-DD in the trip's time zone. */
    date: z.string(),
    announcementsSent: z.number().int(),
    /** Mean acknowledgment rate (0..100) of that day's announcements that take acks; null without one. */
    ackRate: z.number().nullable(),
    headcounts: z.number().int(),
    /** Mean minutes from open to close of that day's closed head counts; null without one. */
    avgCloseMinutes: z.number().nullable(),
    /** Travelers left missing by that day's closed head counts. */
    missing: z.number().int(),
  })
  .openapi('ReportDay');
export type ReportDay = z.infer<typeof ReportDay>;

/** The latest closed head count of a group that left travelers missing (D25, the Safety list). */
export const MissingNow = z
  .object({
    headcountId: z.uuid(),
    groupName: z.string().nullable(),
    openedByName: z.string(),
    closedAtDevice: z.string(),
    receivedAt: Timestamp,
    missing: z.array(HeadcountMissing),
  })
  .openapi('MissingNow');
export type MissingNow = z.infer<typeof MissingNow>;

export const TripReport = z
  .object({
    generatedAt: Timestamp,
    announcements: z.object({
      total: z.number().int(),
      requiringAck: z.number().int(),
      /** Mean over announcements that take acks and have recipients; null without one. */
      avgAckRate: z.number().nullable(),
    }),
    headcounts: z.object({
      total: z.number().int(),
      closed: z.number().int(),
      closedWithMissing: z.number().int(),
      avgCloseMinutes: z.number().nullable(),
      /** Minutes the most recently closed head count took; null without one. */
      lastCloseMinutes: z.number().nullable(),
    }),
    incidents: z.object({
      open: z.number().int(),
      resolved: z.number().int(),
      avgResolveMinutes: z.number().nullable(),
    }),
    /** Null until a fee row exists. */
    fees: z
      .object({
        currency: Currency,
        expectedMinor: z.number().int(),
        collectedMinor: z.number().int(),
        refundedMinor: z.number().int(),
        paid: z.number().int(),
        partial: z.number().int(),
        unpaid: z.number().int(),
        refunded: z.number().int(),
        /** collected / expected, 0..100; null when nothing is expected. */
        collectedPct: z.number().nullable(),
      })
      .nullable(),
    /** Slice 045: completion over the required documents; null until a requirement exists. */
    documents: DocumentSummary.nullable(),
    /** Oldest day first; only days with a fact. */
    byDay: z.array(ReportDay),
    missingNow: z.array(MissingNow),
  })
  .openapi('TripReport');
export type TripReport = z.infer<typeof TripReport>;

/** Minutes from one device HH:mm to another on the same device clock; a wrap past midnight counts forward. */
export function minutesBetweenDeviceTimes(from: string, to: string): number | null {
  const m = (s: string) => {
    const r = /^(\d{2}):(\d{2})$/.exec(s);
    return r ? Number(r[1]) * 60 + Number(r[2]) : null;
  };
  const a = m(from);
  const b = m(to);
  if (a === null || b === null) return null;
  return b >= a ? b - a : b + 24 * 60 - a;
}

/** YYYY-MM-DD of an instant in a time zone (the trip's), falling back to UTC for an unknown zone. */
export function dateInZone(iso: string, timeZone: string): string {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** 1 on `startsOn`, counting calendar days. */
export function tripDayIndex(date: string, startsOn: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** Per group, the latest closed head count that left travelers missing (D25). */
export function latestMissingOf(
  headcounts: {
    id: string;
    groupName: string | null;
    openedByName: string;
    closedAtDevice: string | null;
    receivedAt: string;
    missing: z.infer<typeof HeadcountMissing>[];
    closedWithMissing: boolean;
  }[],
): MissingNow[] {
  const latest = new Map<string, (typeof headcounts)[number]>();
  for (const h of headcounts) {
    if (!h.closedAtDevice) continue;
    const key = h.groupName ?? '';
    const cur = latest.get(key);
    if (!cur || h.receivedAt > cur.receivedAt) latest.set(key, h);
  }
  return [...latest.values()]
    .filter((h) => h.closedWithMissing && h.missing.length > 0 && h.closedAtDevice)
    .sort((a, b) => (a.groupName ?? '').localeCompare(b.groupName ?? ''))
    .map((h) => ({
      headcountId: h.id,
      groupName: h.groupName,
      openedByName: h.openedByName,
      closedAtDevice: h.closedAtDevice ?? '',
      receivedAt: h.receivedAt,
      missing: h.missing,
    }));
}
