// Copyright 2026- At Day. All rights reserved.
//
// Itinerary contracts (D19, D24, ADR-0009). The organizer console is the single writer: it edits
// a draft and publishes a numbered revision. Travelers, leaders, and guardians read the latest
// published revision; the draft is visible to staff only. Times are local wall-clock strings in
// the day's zone; the server never converts them (doc 01 §13.5).

import { z } from '@hono/zod-openapi';
import { CalendarDate, Id, Timestamp } from './common';
import { TimeZone } from './trip';

export const EventKind = z
  .enum(['flight', 'bus', 'meal', 'activity', 'hotel', 'meeting', 'free'])
  .openapi('EventKind');
export type EventKind = z.infer<typeof EventKind>;

export const EventStatus = z
  .enum(['scheduled', 'in_progress', 'done', 'delayed', 'cancelled'])
  .openapi('EventStatus');
export type EventStatus = z.infer<typeof EventStatus>;

const LocalTime = z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm');

export const ItineraryEventInput = z
  .object({
    date: CalendarDate,
    start: LocalTime,
    end: LocalTime.nullable(),
    timeZone: TimeZone,
    kind: EventKind,
    title: z.string().trim().min(1).max(120),
    place: z.string().trim().max(200),
    /** Null means the whole group. */
    pax: z.number().int().min(0).max(5000).nullable(),
    status: EventStatus,
    note: z.string().trim().max(500).nullable(),
    /** Order within the day; the editor reorders by this, not by time. */
    order: z.number().int().min(0),
  })
  .openapi('ItineraryEventInput');
export type ItineraryEventInput = z.infer<typeof ItineraryEventInput>;

export const ItineraryEvent = ItineraryEventInput.extend({
  id: z.uuid(),
  tripId: Id,
  /** False while the draft differs from the latest published revision. */
  published: z.boolean(),
}).openapi('ItineraryEvent');
export type ItineraryEvent = z.infer<typeof ItineraryEvent>;

export const ItineraryDay = z
  .object({ date: CalendarDate, timeZone: TimeZone, label: z.string() })
  .openapi('ItineraryDay');
export type ItineraryDay = z.infer<typeof ItineraryDay>;

export const Itinerary = z
  .object({
    tripId: Id,
    tripName: z.string(),
    startDate: CalendarDate,
    endDate: CalendarDate,
    /** 0 until the first publish. */
    revision: z.number().int(),
    publishedAt: Timestamp.nullable(),
    /** `draft` for staff (the editor), `published` for everyone else. */
    view: z.enum(['draft', 'published']),
    days: z.array(ItineraryDay),
    events: z.array(ItineraryEvent),
    /** Draft changes since the last revision (edits, additions, removals); 0 on the published view. */
    unpublished: z.number().int(),
  })
  .openapi('Itinerary');
export type Itinerary = z.infer<typeof Itinerary>;

export const PublishItineraryRequest = z
  .object({
    /** The revision the editor was looking at; a mismatch is a 409 (someone published first). */
    expectedRevision: z.number().int().min(0),
  })
  .openapi('PublishItineraryRequest');
export type PublishItineraryRequest = z.infer<typeof PublishItineraryRequest>;

/* ---------- Leader change proposals (D24, slice 018) ---------- */

export const ProposalKind = z.enum(['edit', 'add', 'remove']).openapi('ProposalKind');
export type ProposalKind = z.infer<typeof ProposalKind>;

export const ProposalStatus = z.enum(['pending', 'accepted', 'rejected']).openapi('ProposalStatus');
export type ProposalStatus = z.infer<typeof ProposalStatus>;

/** What the leader wants changed. `edit` patches fields, `add` needs the full event, `remove` needs none. */
export const ProposalPatch = ItineraryEventInput.partial().openapi('ProposalPatch');
export type ProposalPatch = z.infer<typeof ProposalPatch>;

export const CreateProposalRequest = z
  .object({
    kind: ProposalKind,
    /** The draft event this is about; null only for `add`. */
    eventId: z.uuid().nullable(),
    patch: ProposalPatch,
    note: z.string().trim().min(1).max(500),
  })
  .openapi('CreateProposalRequest');
export type CreateProposalRequest = z.infer<typeof CreateProposalRequest>;

export const ItineraryProposal = z
  .object({
    id: z.uuid(),
    tripId: Id,
    kind: ProposalKind,
    eventId: z.uuid().nullable(),
    /** Title of the event at proposal time, so the card reads even after the event changed. */
    eventTitle: z.string().nullable(),
    patch: ProposalPatch,
    note: z.string(),
    status: ProposalStatus,
    proposedByName: z.string(),
    proposedAt: Timestamp,
    decidedAt: Timestamp.nullable(),
    decidedByName: z.string().nullable(),
    decisionNote: z.string().nullable(),
  })
  .openapi('ItineraryProposal');
export type ItineraryProposal = z.infer<typeof ItineraryProposal>;

export const ProposalList = z
  .object({ proposals: z.array(ItineraryProposal) })
  .openapi('ProposalList');
export type ProposalList = z.infer<typeof ProposalList>;

export const DecideProposalRequest = z
  .object({
    decision: z.enum(['accept', 'reject']),
    note: z.string().trim().min(1).max(500).nullable(),
  })
  .openapi('DecideProposalRequest');
export type DecideProposalRequest = z.infer<typeof DecideProposalRequest>;
