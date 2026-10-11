// Copyright 2026- At Day. All rights reserved.
//
// Incident contracts (D17, D25, ADR-0009). An incident card is opened by the organizer or
// auto-created by the server when a head count closes with missing travelers (one card per head
// count, never duplicated by a replay). Resolution is a staff action with an optional note; the
// leader confirmation and the guardian message of D17 come in a later slice.

import { z } from '@hono/zod-openapi';
import { Id, Timestamp } from './common';

export const IncidentKind = z.enum(['headcount_missing', 'manual']).openapi('IncidentKind');
export type IncidentKind = z.infer<typeof IncidentKind>;

export const IncidentStatus = z.enum(['open', 'resolved']).openapi('IncidentStatus');
export type IncidentStatus = z.infer<typeof IncidentStatus>;

export const IncidentPerson = z
  .object({ participationId: Id, displayName: z.string(), groupName: z.string().nullable() })
  .openapi('IncidentPerson');

/** A leader's answer from the phone (D17): what they see right now. */
export const ConfirmationStatus = z
  .enum(['with_group', 'not_with_group', 'unknown'])
  .openapi('ConfirmationStatus');
export type ConfirmationStatus = z.infer<typeof ConfirmationStatus>;

export const IncidentConfirmation = z
  .object({
    id: z.uuid(),
    status: ConfirmationStatus,
    note: z.string().nullable(),
    confirmedByName: z.string(),
    /** `leader` from the phone, `organizer` from the console. */
    confirmedByRole: z.enum(['leader', 'organizer']),
    confirmedAt: Timestamp,
  })
  .openapi('IncidentConfirmation');
export type IncidentConfirmation = z.infer<typeof IncidentConfirmation>;

export const ConfirmIncidentRequest = z
  .object({ status: ConfirmationStatus, note: z.string().trim().min(1).max(500).nullable() })
  .openapi('ConfirmIncidentRequest');
export type ConfirmIncidentRequest = z.infer<typeof ConfirmIncidentRequest>;

/**
 * The status message guardians receive (D17). Composed by the server from the latest
 * confirmation in both supported languages; clients show the reader's. Sent only on the
 * organizer's action, never automatically.
 */
export const GuardianMessage = z
  .object({
    bodyEn: z.string(),
    bodyKo: z.string(),
    sentAt: Timestamp,
    sentByName: z.string(),
  })
  .openapi('GuardianMessage');
export type GuardianMessage = z.infer<typeof GuardianMessage>;

export const Incident = z
  .object({
    id: z.uuid(),
    tripId: Id,
    kind: IncidentKind,
    status: IncidentStatus,
    title: z.string(),
    /** The head count that opened this card, for `headcount_missing`. */
    headcountId: z.uuid().nullable(),
    people: z.array(IncidentPerson),
    openedAt: Timestamp,
    openedByName: z.string(),
    resolvedAt: Timestamp.nullable(),
    resolvedByName: z.string().nullable(),
    resolutionNote: z.string().nullable(),
    /** Newest first. Empty for guardians (they get the message, not the trail). */
    confirmations: z.array(IncidentConfirmation),
    guardianMessage: GuardianMessage.nullable(),
  })
  .openapi('Incident');
export type Incident = z.infer<typeof Incident>;

export const IncidentList = z.object({ incidents: z.array(Incident) }).openapi('IncidentList');
export type IncidentList = z.infer<typeof IncidentList>;

export const ResolveIncidentRequest = z
  .object({ note: z.string().trim().min(1).max(500).nullable() })
  .openapi('ResolveIncidentRequest');
export type ResolveIncidentRequest = z.infer<typeof ResolveIncidentRequest>;
