// Copyright 2026- At Day. All rights reserved.
//
// Meeting windows (D15, slice 029): no ambient tracking. A leader opens a window (a time range,
// a meeting point with a radius, the groups it concerns); each traveler opts in per window; their
// device compares its own fix with the meeting point and reports only a state. The server holds
// states and the meeting point while the window is open, never a person's coordinates, and
// forgets the point at close. Guardians never see windows (D13).

import { z } from '@hono/zod-openapi';
import { Id, Timestamp } from './common';
import { GroupName } from './roster';

export const WindowMemberState = z
  .enum(['opted_out', 'inside', 'outside', 'uncertain', 'stale'])
  .openapi('WindowMemberState');
export type WindowMemberState = z.infer<typeof WindowMemberState>;

/** What a device reports: its own judgement, never a position. `stale` is derived by the server. */
export const ReportedWindowState = z
  .enum(['opted_out', 'inside', 'outside', 'uncertain'])
  .openapi('ReportedWindowState');
export type ReportedWindowState = z.infer<typeof ReportedWindowState>;

export const WindowStatus = z.enum(['scheduled', 'open', 'closed']).openapi('WindowStatus');
export type WindowStatus = z.infer<typeof WindowStatus>;

/** The meeting point. The only coordinates the service ever holds, and only while the window is open. */
export const GeoPoint = z
  .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
  .openapi('GeoPoint');
export type GeoPoint = z.infer<typeof GeoPoint>;

export const OpenWindowRequest = z
  .object({
    label: z.string().trim().min(1).max(80),
    place: z.string().trim().min(1).max(120),
    radiusMeters: z.number().int().min(25).max(2000),
    startsAt: Timestamp,
    endsAt: Timestamp,
    /** Groups whose travelers are members; empty means every traveler of the trip. */
    groups: z.array(GroupName).max(20).default([]),
    center: GeoPoint,
  })
  .openapi('OpenWindowRequest');
export type OpenWindowRequest = z.infer<typeof OpenWindowRequest>;

export const WindowMember = z
  .object({
    participationId: Id,
    displayName: z.string(),
    groupName: z.string().nullable(),
    state: WindowMemberState,
    /** Server receipt of the last report; null before the first. */
    reportedAt: Timestamp.nullable(),
  })
  .openapi('WindowMember');
export type WindowMember = z.infer<typeof WindowMember>;

export const WindowCounts = z
  .object({
    inside: z.number().int(),
    outside: z.number().int(),
    uncertain: z.number().int(),
    stale: z.number().int(),
    optedOut: z.number().int(),
    total: z.number().int(),
  })
  .openapi('WindowCounts');
export type WindowCounts = z.infer<typeof WindowCounts>;

export const MeetingWindow = z
  .object({
    id: z.uuid(),
    tripId: Id,
    label: z.string(),
    place: z.string(),
    radiusMeters: z.number().int(),
    startsAt: Timestamp,
    endsAt: Timestamp,
    groups: z.array(z.string()),
    openedByName: z.string(),
    openedAt: Timestamp,
    closedAt: Timestamp.nullable(),
    status: WindowStatus,
    /** Present only while open and only to members who may share; erased at close. */
    center: GeoPoint.nullable(),
    /** Staff see every member; a traveler sees only their own row. */
    members: z.array(WindowMember),
    counts: WindowCounts,
  })
  .openapi('MeetingWindow');
export type MeetingWindow = z.infer<typeof MeetingWindow>;

export const WindowList = z.object({ windows: z.array(MeetingWindow) }).openapi('WindowList');
export type WindowList = z.infer<typeof WindowList>;

export const ReportWindowStateRequest = z
  .object({ state: ReportedWindowState })
  .openapi('ReportWindowStateRequest');
export type ReportWindowStateRequest = z.infer<typeof ReportWindowStateRequest>;

export const ReportWindowStateResponse = z
  .object({
    state: WindowMemberState,
    reportedAt: Timestamp.nullable(),
    windowStatus: WindowStatus,
  })
  .openapi('ReportWindowStateResponse');
export type ReportWindowStateResponse = z.infer<typeof ReportWindowStateResponse>;

/** A report older than this while the window is open reads as `stale`. */
export const WINDOW_STALE_MS = 3 * 60 * 1000;

/**
 * The device's judgement from its own fix (shared rule, also in core for the phones): inside when
 * the fix lies within the radius even at its worst accuracy; outside when it lies beyond the
 * radius even at its best; uncertain in between or without a fix.
 */
export function windowStateOf(
  distanceMeters: number | null,
  accuracyMeters: number,
  radiusMeters: number,
): ReportedWindowState {
  if (distanceMeters === null) return 'uncertain';
  if (distanceMeters + accuracyMeters <= radiusMeters) return 'inside';
  if (distanceMeters - accuracyMeters > radiusMeters) return 'outside';
  return 'uncertain';
}

export function windowStatusOf(
  startsAt: string,
  endsAt: string,
  closedAt: string | null,
  now: string,
): WindowStatus {
  if (closedAt || now >= endsAt) return 'closed';
  if (now < startsAt) return 'scheduled';
  return 'open';
}
