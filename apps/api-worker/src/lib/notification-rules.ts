// Copyright 2026- At Day. All rights reserved.
//
// Notification lanes (D29, slice 052), as pure rules. Which lane a role gets for a kind of
// event, and when a lane delivers: the priority lane at once; the normal lane at once unless the
// trip's quiet hours are on, then when they end; the digest lane at the organization's digest
// hour, today if it is still ahead, else tomorrow. Times are wall-clock in the trip's zone.

import { localClock, plusDays, zonedToIso } from './time';

export type NotificationLane = 'priority' | 'normal' | 'digest';
export type NotificationKind =
  | 'announcement'
  | 'itinerary_revision'
  | 'headcount_call'
  | 'incident_status'
  | 'proposal_decided';
export type AudienceRole = 'traveler' | 'leader' | 'guardian';

export type LaneFlags = { requiresAck?: boolean; sharedWithGuardians?: boolean };

/**
 * D29 by role. Guardians: an incident's status is priority; an announcement shared with them is
 * normal, an itinerary revision shared with them rides the digest; nothing else. Travelers: a
 * required-ack announcement and a head-count call are priority, other announcements and
 * revisions normal; incidents and proposals are not theirs. Leaders: head counts, incidents and
 * decided proposals are priority; announcements and revisions normal.
 */
export function laneFor(
  role: AudienceRole,
  kind: NotificationKind,
  flags: LaneFlags = {},
): NotificationLane | null {
  switch (role) {
    case 'guardian':
      if (kind === 'incident_status') return 'priority';
      if (!flags.sharedWithGuardians) return null;
      if (kind === 'announcement') return 'normal';
      if (kind === 'itinerary_revision') return 'digest';
      return null;
    case 'traveler':
      if (kind === 'headcount_call') return 'priority';
      if (kind === 'announcement') return flags.requiresAck ? 'priority' : 'normal';
      if (kind === 'itinerary_revision') return 'normal';
      return null;
    case 'leader':
      if (kind === 'headcount_call' || kind === 'incident_status' || kind === 'proposal_decided') {
        return 'priority';
      }
      return 'normal';
  }
}

export type QuietHours = { from: string; to: string };

/** True when a wall-clock time falls inside quiet hours, which may cross midnight (23:00-06:30). */
export function inQuietHours(time: string, quiet: QuietHours): boolean {
  if (quiet.from === quiet.to) return false;
  return quiet.from < quiet.to
    ? time >= quiet.from && time < quiet.to
    : time >= quiet.from || time < quiet.to;
}

/** When a lane delivers, as an instant; `now` is the instant the event happened. */
export function deliverAt(
  lane: NotificationLane,
  now: string,
  timeZone: string,
  quiet: QuietHours,
  digestAt: string,
): string {
  const { date, time } = localClock(now, timeZone);
  if (lane === 'priority') return now;
  if (lane === 'normal') {
    if (!inQuietHours(time, quiet)) return now;
    // Quiet hours end today when they end later today, else tomorrow (they crossed midnight).
    const endsToday = quiet.from < quiet.to || time < quiet.to;
    return zonedToIso(endsToday ? date : plusDays(date, 1), quiet.to, timeZone);
  }
  return zonedToIso(time < digestAt ? date : plusDays(date, 1), digestAt, timeZone);
}
