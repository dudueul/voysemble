// Copyright 2026- At Day. All rights reserved.
//
// Head count contracts (D14, D25, ADR-0009). Device-first: the leader opens, marks, and closes on
// the phone; the server receives the whole session in one idempotent upsert keyed by the
// client-minted id. Replaying the same upsert is a no-op; a closed session never reopens.

import { z } from '@hono/zod-openapi';
import { Id, Timestamp } from './common';

export const HeadcountMark = z
  .enum(['present', 'missing', 'with_other_group', 'excused'])
  .openapi('HeadcountMark');
export type HeadcountMark = z.infer<typeof HeadcountMark>;

export const HeadcountMarkInput = z
  .object({ participationId: Id, mark: HeadcountMark })
  .openapi('HeadcountMarkInput');

export const SyncHeadcountRequest = z
  .object({
    /** Local HH:mm or RFC 3339 as the device recorded it. Stored verbatim for the audit trail. */
    openedAtDevice: z.string().min(1).max(40),
    closedAtDevice: z.string().min(1).max(40).nullable(),
    /** Null = whole trip; otherwise the roster group (e.g. "Bus A"). */
    groupName: z.string().trim().min(1).max(40).nullable(),
    marks: z.array(HeadcountMarkInput).max(2000),
  })
  .openapi('SyncHeadcountRequest');
export type SyncHeadcountRequest = z.infer<typeof SyncHeadcountRequest>;

export const HeadcountMissing = z
  .object({
    participationId: Id,
    displayName: z.string(),
    groupName: z.string().nullable(),
    mark: HeadcountMark,
  })
  .openapi('HeadcountMissing');

export const HeadcountSession = z
  .object({
    id: z.uuid(),
    tripId: Id,
    groupName: z.string().nullable(),
    openedByName: z.string(),
    openedAtDevice: z.string(),
    closedAtDevice: z.string().nullable(),
    /** Server time of the latest accepted sync. */
    receivedAt: Timestamp,
    /** Travelers in scope (group or whole trip). */
    expected: z.number().int(),
    present: z.number().int(),
    /** present + with_other_group + excused. */
    accounted: z.number().int(),
    missing: z.array(HeadcountMissing),
    closedWithMissing: z.boolean(),
  })
  .openapi('HeadcountSession');
export type HeadcountSession = z.infer<typeof HeadcountSession>;

export const SyncHeadcountResponse = z
  .object({
    session: HeadcountSession,
    /** False when the server already held this session closed and ignored the replay. */
    applied: z.boolean(),
    /** The incident card opened because this close left travelers missing (D25), if any. */
    incidentId: z.uuid().nullable(),
  })
  .openapi('SyncHeadcountResponse');
export type SyncHeadcountResponse = z.infer<typeof SyncHeadcountResponse>;

export const HeadcountList = z
  .object({ headcounts: z.array(HeadcountSession) })
  .openapi('HeadcountList');
export type HeadcountList = z.infer<typeof HeadcountList>;
