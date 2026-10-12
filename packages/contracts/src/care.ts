// Copyright 2026- At Day. All rights reserved.
//
// Care notes (D27, slice 030): short structured PII on a traveler (allergies, medications, a free
// line) that a leader must see in one tap at lunch and that must not live in plain text in ten
// phones. Stored sealed (AES-GCM) in the organization's Durable Object; decrypted only on a
// reveal, and every reveal is an audited fact on the person's timeline. Guardians and the
// organizer write it; the organizer, the traveler's own group leaders, the traveler and their
// guardians may reveal it. Documents (scans) are a later slice.

import { z } from '@hono/zod-openapi';
import { Id, Timestamp } from './common';

export const CareNote = z
  .object({
    allergies: z.string().trim().max(200).default(''),
    medications: z.string().trim().max(200).default(''),
    freeText: z.string().trim().max(500).default(''),
  })
  .openapi('CareNote');
export type CareNote = z.infer<typeof CareNote>;

/** What everyone allowed to ask may see without a reveal: whether a note exists and who set it. */
export const CareNoteStatus = z
  .object({
    participationId: Id,
    hasCareNote: z.boolean(),
    updatedAt: Timestamp.nullable(),
    updatedByName: z.string().nullable(),
    /** Audited reveals so far, by anyone, kept even after the note is cleared. */
    reveals: z.number().int(),
  })
  .openapi('CareNoteStatus');
export type CareNoteStatus = z.infer<typeof CareNoteStatus>;

export const RevealCareNoteResponse = z
  .object({
    participationId: Id,
    note: CareNote,
    updatedAt: Timestamp,
    updatedByName: z.string(),
    /** Server time of this reveal; the same instant is on the timeline. */
    revealedAt: Timestamp,
  })
  .openapi('RevealCareNoteResponse');
export type RevealCareNoteResponse = z.infer<typeof RevealCareNoteResponse>;

/** An all-blank note is no note: a PUT with one clears the row. */
export function careNoteIsEmpty(n: CareNote): boolean {
  return n.allergies.trim() === '' && n.medications.trim() === '' && n.freeText.trim() === '';
}

/** One line for a row or a chip: "Allergies: peanuts · Medications: EpiPen · inhaler in the bag". */
export function careLineOf(n: CareNote): string {
  return [
    n.allergies.trim() ? `Allergies: ${n.allergies.trim()}` : null,
    n.medications.trim() ? `Medications: ${n.medications.trim()}` : null,
    n.freeText.trim() || null,
  ]
    .filter(Boolean)
    .join(' · ');
}
