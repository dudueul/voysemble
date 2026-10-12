// Copyright 2026- At Day. All rights reserved.
//
// The trip report (slice 034) from facts the Durable Object already holds. Pure: inputs in,
// report out; the route gathers the lists and the test feeds hand-built ones.

import {
  type Announcement,
  type DocumentSummary,
  dateInZone,
  type FeeLedger,
  type HeadcountSession,
  type Incident,
  latestMissingOf,
  minutesBetweenDeviceTimes,
  type ReportDay,
  type Trip,
  type TripReport,
  tripDayIndex,
} from '@voysemble/contracts';

export type ReportInputs = {
  trip: Trip;
  announcements: Announcement[];
  headcounts: HeadcountSession[];
  incidents: Incident[];
  fees: FeeLedger | null;
  /** Slice 045: the documents tile; absent or null until a requirement exists. */
  documents?: DocumentSummary | null;
  now: string;
};

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;

export function buildTripReport(i: ReportInputs): TripReport {
  const zone = i.trip.timezone;
  const days = new Map<string, ReportDay & { rates: number[]; closes: number[] }>();
  const dayFor = (iso: string) => {
    const date = dateInZone(iso, zone);
    let d = days.get(date);
    if (!d) {
      d = {
        day: tripDayIndex(date, i.trip.startsOn),
        date,
        announcementsSent: 0,
        ackRate: null,
        headcounts: 0,
        avgCloseMinutes: null,
        missing: 0,
        rates: [],
        closes: [],
      };
      days.set(date, d);
    }
    return d;
  };

  const sent = i.announcements.filter((a) => a.kind === 'announcement');
  const rates: number[] = [];
  for (const a of sent) {
    const d = dayFor(a.publishedAt);
    d.announcementsSent += 1;
    if (a.requiresAck && a.ackTotal > 0) {
      const rate = Math.round((a.ackCount / a.ackTotal) * 100);
      rates.push(rate);
      d.rates.push(rate);
    }
  }

  const closes: { minutes: number; receivedAt: string }[] = [];
  let closedWithMissing = 0;
  for (const h of i.headcounts) {
    const d = dayFor(h.receivedAt);
    d.headcounts += 1;
    if (!h.closedAtDevice) continue;
    const minutes = minutesBetweenDeviceTimes(h.openedAtDevice, h.closedAtDevice);
    if (minutes !== null) {
      closes.push({ minutes, receivedAt: h.receivedAt });
      d.closes.push(minutes);
    }
    if (h.closedWithMissing) {
      closedWithMissing += 1;
      d.missing += h.missing.length;
    }
  }
  const lastClose = [...closes].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];

  const resolveMinutes = i.incidents
    .filter((x) => x.resolvedAt)
    .map((x) => Math.round((Date.parse(x.resolvedAt ?? '') - Date.parse(x.openedAt)) / 60_000));

  const fees =
    i.fees && i.fees.rows.length > 0
      ? {
          currency: i.fees.currency,
          expectedMinor: i.fees.totals.expectedMinor,
          collectedMinor: i.fees.totals.collectedMinor,
          refundedMinor: i.fees.totals.refundedMinor,
          paid: i.fees.totals.paid,
          partial: i.fees.totals.partial,
          unpaid: i.fees.totals.unpaid,
          refunded: i.fees.totals.refunded,
          collectedPct:
            i.fees.totals.expectedMinor > 0
              ? Math.round((i.fees.totals.collectedMinor / i.fees.totals.expectedMinor) * 100)
              : null,
        }
      : null;

  const byDay: ReportDay[] = [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ rates, closes, ...d }) => ({
      ...d,
      ackRate: mean(rates),
      avgCloseMinutes: mean(closes),
    }));

  return {
    generatedAt: i.now,
    announcements: {
      total: sent.length,
      requiringAck: sent.filter((a) => a.requiresAck).length,
      avgAckRate: mean(rates),
    },
    headcounts: {
      total: i.headcounts.length,
      closed: i.headcounts.filter((h) => h.closedAtDevice).length,
      closedWithMissing,
      avgCloseMinutes: mean(closes.map((c) => c.minutes)),
      lastCloseMinutes: lastClose?.minutes ?? null,
    },
    incidents: {
      open: i.incidents.filter((x) => x.status === 'open').length,
      resolved: i.incidents.filter((x) => x.status === 'resolved').length,
      avgResolveMinutes: mean(resolveMinutes),
    },
    fees,
    documents: i.documents ?? null,
    byDay,
    missingNow: latestMissingOf(i.headcounts),
  };
}
