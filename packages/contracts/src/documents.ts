// Copyright 2026- At Day. All rights reserved.
//
// Documents and forms (D27, slice 045): what a trip needs from every traveler (passport copy,
// consent, insurance), who has handed it in, and the scan when the organizer keeps one. Scans
// are tier 3 (ADR-0001): sealed at rest, organizer console only, revealed after a step-up
// reauthentication (D35), every reveal a fact on the traveler's timeline, never on a phone.

import { z } from '@hono/zod-openapi';
import { CalendarDate, Id, Timestamp } from './common';

export const DocumentState = z.enum(['missing', 'collected', 'waived']).openapi('DocumentState');
export type DocumentState = z.infer<typeof DocumentState>;

export const DocumentName = z.string().trim().min(1).max(80);

/** Per requirement, over the trip's travelers: a traveler without an item counts as missing. */
export const DocumentCounts = z
  .object({
    travelers: z.number().int(),
    collected: z.number().int(),
    waived: z.number().int(),
    missing: z.number().int(),
    /** Items with a sealed scan on file. */
    scans: z.number().int(),
  })
  .openapi('DocumentCounts');
export type DocumentCounts = z.infer<typeof DocumentCounts>;

export const DocumentRequirement = z
  .object({
    id: Id,
    tripId: Id,
    name: DocumentName,
    required: z.boolean(),
    dueOn: CalendarDate.nullable(),
    createdAt: Timestamp,
    counts: DocumentCounts,
  })
  .openapi('DocumentRequirement');
export type DocumentRequirement = z.infer<typeof DocumentRequirement>;

export const DocumentRequirementList = z
  .object({
    requirements: z.array(DocumentRequirement),
    travelers: z.number().int(),
    /** Missing items over the required requirements. */
    missingRequired: z.number().int(),
  })
  .openapi('DocumentRequirementList');
export type DocumentRequirementList = z.infer<typeof DocumentRequirementList>;

export const CreateDocumentRequirementRequest = z
  .object({
    name: DocumentName,
    required: z.boolean().default(true),
    dueOn: CalendarDate.nullable().default(null),
  })
  .openapi('CreateDocumentRequirementRequest');
export type CreateDocumentRequirementRequest = z.infer<typeof CreateDocumentRequirementRequest>;

export const UpdateDocumentRequirementRequest = z
  .object({
    name: DocumentName.optional(),
    required: z.boolean().optional(),
    dueOn: CalendarDate.nullable().optional(),
  })
  .openapi('UpdateDocumentRequirementRequest');
export type UpdateDocumentRequirementRequest = z.infer<typeof UpdateDocumentRequirementRequest>;

export const DocumentScanType = z
  .enum(['application/pdf', 'image/jpeg', 'image/png'])
  .openapi('DocumentScanType');
export type DocumentScanType = z.infer<typeof DocumentScanType>;

/** The scan's facts; the bytes come only from the reveal route. */
export const DocumentScan = z
  .object({
    contentType: DocumentScanType,
    bytes: z.number().int(),
    uploadedAt: Timestamp,
    uploadedByName: z.string(),
  })
  .openapi('DocumentScan');
export type DocumentScan = z.infer<typeof DocumentScan>;

/** One traveler's row under a requirement; a traveler without a row is `missing`. */
export const DocumentItem = z
  .object({
    requirementId: Id,
    participationId: Id,
    displayName: z.string(),
    groupName: z.string().nullable(),
    state: DocumentState,
    updatedAt: Timestamp.nullable(),
    updatedByName: z.string().nullable(),
    scan: DocumentScan.nullable(),
    /** Audited reveals of the scan so far. */
    reveals: z.number().int(),
  })
  .openapi('DocumentItem');
export type DocumentItem = z.infer<typeof DocumentItem>;

export const DocumentItemList = z
  .object({ requirement: DocumentRequirement, items: z.array(DocumentItem) })
  .openapi('DocumentItemList');
export type DocumentItemList = z.infer<typeof DocumentItemList>;

export const SetDocumentStateRequest = z
  .object({ state: DocumentState })
  .openapi('SetDocumentStateRequest');
export type SetDocumentStateRequest = z.infer<typeof SetDocumentStateRequest>;

/** `POST .../scan` as multipart/form-data: `file` (PDF, JPEG or PNG, at most 12 MiB). */
export const UploadDocumentForm = z
  .object({ file: z.any().openapi({ type: 'string', format: 'binary' }) })
  .openapi('UploadDocumentForm');

export const DOCUMENT_MAX_BYTES = 12 * 1024 * 1024;

/** The report's documents tile (slice 045): completion over the required requirements. */
export const DocumentSummary = z
  .object({
    requirements: z.number().int(),
    required: z.number().int(),
    travelers: z.number().int(),
    /** travelers × required requirements. */
    requiredItems: z.number().int(),
    /** Collected or waived among those. */
    requiredDone: z.number().int(),
    missingRequired: z.number().int(),
    /** requiredDone / requiredItems, 0..100; null without a required requirement or a traveler. */
    completionPct: z.number().nullable(),
  })
  .openapi('DocumentSummary');
export type DocumentSummary = z.infer<typeof DocumentSummary>;

/**
 * `POST .../documents/{id}/remind` (slice 060): every traveler still missing the document, and
 * the guardians bound to them, hear it once a day in the normal lane (D29).
 */
export const DocumentRemindResponse = z
  .object({
    /** Travelers whose item is missing. */
    missing: z.number().int(),
    /** Notifications written by this call (travelers and guardians). */
    reminded: z.number().int(),
    /** People already reminded today, or without a lane. */
    skipped: z.number().int(),
  })
  .openapi('DocumentRemindResponse');
export type DocumentRemindResponse = z.infer<typeof DocumentRemindResponse>;
