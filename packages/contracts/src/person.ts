// Copyright 2026- At Day. All rights reserved.
//
// The per-person card and timeline on the console (D17, slice 026): what the organizer answers
// from when a guardian asks. Every entry is a fact the system already recorded (acknowledgments,
// head count marks, incidents and their confirmations, the join) with a server time; nothing is
// inferred. Staff only (owner, organizer, participating leader).

import { z } from '@hono/zod-openapi';
import { Id, Timestamp } from './common';
import { InviteStatus, RosterEntry } from './roster';

export const TimelineKind = z
  .enum([
    'joined',
    'ack',
    'headcount',
    'incident',
    'confirmation',
    'guardian_message',
    'care_update',
    'care_reveal',
  ])
  .openapi('TimelineKind');
export type TimelineKind = z.infer<typeof TimelineKind>;

export const TimelineEntry = z
  .object({
    kind: TimelineKind,
    /** Server time of the fact (receipt, publish, open, resolve, send). */
    at: Timestamp,
    title: z.string(),
    detail: z.string().nullable(),
    /** What the entry points at, for a later deep link. */
    ref: z
      .object({ type: z.enum(['announcement', 'headcount', 'incident']), id: z.string() })
      .nullable(),
  })
  .openapi('TimelineEntry');
export type TimelineEntry = z.infer<typeof TimelineEntry>;

export const PersonLink = z
  .object({ participationId: Id, displayName: z.string(), invite: InviteStatus })
  .openapi('PersonLink');
export type PersonLink = z.infer<typeof PersonLink>;

export const PersonTimeline = z
  .object({
    participation: RosterEntry,
    /** For a guardian: the traveler they are bound to. */
    guardianOf: PersonLink.nullable(),
    /** For a traveler: the guardians bound to them. */
    guardians: z.array(PersonLink),
    /** Newest first, at most 200. */
    entries: z.array(TimelineEntry),
  })
  .openapi('PersonTimeline');
export type PersonTimeline = z.infer<typeof PersonTimeline>;
