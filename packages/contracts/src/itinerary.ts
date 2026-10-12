// Copyright 2026- At Day. All rights reserved.
//
// Itinerary contracts (D19, D24, ADR-0009). The organizer console is the single writer: it edits
// a draft and publishes a numbered revision. Travelers, leaders, and guardians read the latest
// published revision; the draft is visible to staff only. Times are local wall-clock strings in
// the day's zone; the server never converts them (doc 01 §13.5).

import { z } from '@hono/zod-openapi';
import { RevisionSummary } from './announcement';
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
    /**
     * Open a required-ack announcement with the diff (D19). Ignored for revision 1 and for diffs
     * that touch only past days. Default on; "publish quietly" sends false.
     */
    notify: z.boolean().default(true),
    /** Organizer's note appended to the announcement body, in their own words. */
    note: z.string().trim().max(500).nullable().default(null),
  })
  .openapi('PublishItineraryRequest');
export type PublishItineraryRequest = z.infer<typeof PublishItineraryRequest>;

export const PublishItineraryResponse = z
  .object({
    itinerary: Itinerary,
    /** The announcement opened for this revision, or null (quiet, revision 1, nothing current). */
    announcementId: z.uuid().nullable(),
    diff: RevisionSummary,
  })
  .openapi('PublishItineraryResponse');
export type PublishItineraryResponse = z.infer<typeof PublishItineraryResponse>;

/* ---------- Revision history (D19, slice 057) ---------- */

/** One published revision as the history lists it: who, when, what changed, how many events. */
export const ItineraryRevision = z
  .object({
    revision: z.number().int(),
    publishedAt: Timestamp,
    publishedByName: z.string(),
    summary: RevisionSummary,
    /** Events in the snapshot (cancelled ones included). */
    events: z.number().int(),
  })
  .openapi('ItineraryRevision');
export type ItineraryRevision = z.infer<typeof ItineraryRevision>;

export const ItineraryRevisionList = z
  .object({ revisions: z.array(ItineraryRevision) })
  .openapi('ItineraryRevisionList');
export type ItineraryRevisionList = z.infer<typeof ItineraryRevisionList>;

/** A revision with its snapshot: the events exactly as they were published. */
export const ItineraryRevisionDetail = ItineraryRevision.extend({
  snapshot: z.array(ItineraryEvent),
}).openapi('ItineraryRevisionDetail');
export type ItineraryRevisionDetail = z.infer<typeof ItineraryRevisionDetail>;

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

/* ---------- Disruption drafts from the AI port (D19, slice 055) ---------- */

/** One event of the day's chain from the slipped one on, with where the propagation put it. */
export const DisruptionDraftEvent = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(120),
    kind: EventKind,
    start: LocalTime,
    end: LocalTime.nullable(),
    /** The start and end after the propagated slip; null when the event did not move. */
    newStart: LocalTime.nullable(),
    newEnd: LocalTime.nullable(),
  })
  .openapi('DisruptionDraftEvent');
export type DisruptionDraftEvent = z.infer<typeof DisruptionDraftEvent>;

/** What the organizer hands the AI: the slip and the chain it propagates through, in start order. */
export const DisruptionDraftRequest = z
  .object({
    date: CalendarDate,
    slippedEventId: z.uuid(),
    minutes: z.number().int().min(1).max(600),
    events: z.array(DisruptionDraftEvent).min(1).max(40),
    locale: z.enum(['ko', 'en']),
  })
  .openapi('DisruptionDraftRequest');
export type DisruptionDraftRequest = z.infer<typeof DisruptionDraftRequest>;

/**
 * One step of a draft: move an event (new start, and end when it has one), shorten it (new end,
 * start as moved), cut it (cancelled in the draft) or keep it where it is.
 */
export const DisruptionDraftAction = z
  .object({
    eventId: z.uuid(),
    action: z.enum(['move', 'shorten', 'cut', 'keep']),
    start: LocalTime.nullable(),
    end: LocalTime.nullable(),
  })
  .openapi('DisruptionDraftAction');
export type DisruptionDraftAction = z.infer<typeof DisruptionDraftAction>;

export const DisruptionDraft = z
  .object({
    title: z.string().trim().min(1).max(80),
    rationale: z.string().trim().min(1).max(300),
    actions: z.array(DisruptionDraftAction).max(40),
  })
  .openapi('DisruptionDraft');
export type DisruptionDraft = z.infer<typeof DisruptionDraft>;

/** The answer: two or three variants, or none when the provider has no answer here. */
export const DisruptionDraftResponse = z
  .object({
    provider: z.enum(['workers-ai', 'fixture', 'disabled']),
    drafts: z.array(DisruptionDraft),
  })
  .openapi('DisruptionDraftResponse');
export type DisruptionDraftResponse = z.infer<typeof DisruptionDraftResponse>;
