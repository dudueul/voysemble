// Copyright 2026- At Day. All rights reserved.
//
// Announcement and acknowledgment contracts (D16, ADR-0009). Announcements belong to a trip and
// live in the OrgDurableObject. Acks are idempotent per (announcement, participation): the device
// may send the same ack many times (offline outbox replay) and the server stores one row.

import { z } from '@hono/zod-openapi';
import { Id, Timestamp } from './common';

export const AnnouncementTitle = z.string().trim().min(1).max(120);
export const AnnouncementBody = z.string().trim().min(1).max(2000);

export const AckState = z.enum(['unacknowledged', 'pending', 'acknowledged']).openapi('AckState');
export type AckState = z.infer<typeof AckState>;

export const CreateAnnouncementRequest = z
  .object({
    title: AnnouncementTitle,
    body: AnnouncementBody,
    requiresAck: z.boolean().default(true),
    sharedWithGuardians: z.boolean().default(false),
  })
  .openapi('CreateAnnouncementRequest');
export type CreateAnnouncementRequest = z.infer<typeof CreateAnnouncementRequest>;

/** Server-side KO<->EN translation (D16). Machine text is labelled; a leader may replace it. */
export const AnnouncementTranslation = z
  .object({
    locale: z.enum(['ko', 'en']),
    body: AnnouncementBody,
    provider: z.enum(['machine', 'edited']),
    /** Display name of the bilingual staff member who replaced the machine text. */
    editedBy: z.string().nullable(),
  })
  .openapi('AnnouncementTranslation');
export type AnnouncementTranslation = z.infer<typeof AnnouncementTranslation>;

export const EditTranslationRequest = z
  .object({ body: AnnouncementBody })
  .openapi('EditTranslationRequest');
export type EditTranslationRequest = z.infer<typeof EditTranslationRequest>;

export const Announcement = z
  .object({
    id: Id,
    tripId: Id,
    title: AnnouncementTitle,
    body: AnnouncementBody,
    requiresAck: z.boolean(),
    sharedWithGuardians: z.boolean(),
    authorName: z.string(),
    publishedAt: Timestamp,
    /** Travelers and leaders who must acknowledge (guardians never count). */
    ackTotal: z.number().int(),
    ackCount: z.number().int(),
    /** The caller's own state; `unacknowledged` for viewers with no ack duty. */
    myAck: z.enum(['unacknowledged', 'acknowledged']),
    /** Null when no translation exists (provider unavailable or same-language readers only). */
    translation: AnnouncementTranslation.nullable(),
  })
  .openapi('Announcement');
export type Announcement = z.infer<typeof Announcement>;

export const AnnouncementList = z
  .object({ announcements: z.array(Announcement) })
  .openapi('AnnouncementList');
export type AnnouncementList = z.infer<typeof AnnouncementList>;

export const AckRequest = z
  .object({
    /** Device wall-clock when the traveler tapped, RFC 3339. Kept for the audit trail. */
    ackedAtDevice: Timestamp,
  })
  .openapi('AckRequest');
export type AckRequest = z.infer<typeof AckRequest>;

export const AckResponse = z
  .object({
    announcementId: Id,
    participationId: Id,
    /** True when this call created the ack; false when it was already stored (idempotent replay). */
    created: z.boolean(),
    ackedAtDevice: Timestamp,
    receivedAt: Timestamp,
  })
  .openapi('AckResponse');
export type AckResponse = z.infer<typeof AckResponse>;

export const AckStatusEntry = z
  .object({
    participationId: Id,
    displayName: z.string(),
    groupName: z.string().nullable(),
    ackedAt: Timestamp.nullable(),
  })
  .openapi('AckStatusEntry');

export const AckStatus = z
  .object({
    announcementId: Id,
    acked: z.array(AckStatusEntry),
    unacked: z.array(AckStatusEntry),
  })
  .openapi('AckStatus');
export type AckStatus = z.infer<typeof AckStatus>;
