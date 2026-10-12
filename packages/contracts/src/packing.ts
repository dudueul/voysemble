// Copyright 2026- At Day. All rights reserved.
//
// Packing checklist (D38, slice 048): the items an organizer asks every traveler to bring, ticked
// by the traveler on their phone (or by their guardian for a young traveler), read as progress by
// leaders and the organizer. Tier 1 facts (ADR-0001): an item name and a tick, nothing sensitive.

import { z } from '@hono/zod-openapi';
import { Id, Timestamp } from './common';

export const PackingItemName = z.string().trim().min(1).max(80);
export const PackingNote = z.string().trim().max(160);

/** One item as the organizer sees it, with how many travelers have packed it. */
export const PackingItem = z
  .object({
    id: Id,
    tripId: Id,
    name: PackingItemName,
    note: z.string(),
    createdAt: Timestamp,
    counts: z.object({ travelers: z.number().int(), packed: z.number().int() }),
  })
  .openapi('PackingItem');
export type PackingItem = z.infer<typeof PackingItem>;

/** One traveler's progress over the current items (ticks on deleted items do not count). */
export const PackingTravelerProgress = z
  .object({
    participationId: Id,
    displayName: z.string(),
    groupName: z.string().nullable(),
    packed: z.number().int(),
    total: z.number().int(),
    lastPackedAt: Timestamp.nullable(),
  })
  .openapi('PackingTravelerProgress');
export type PackingTravelerProgress = z.infer<typeof PackingTravelerProgress>;

export const PackingList = z
  .object({
    items: z.array(PackingItem),
    travelers: z.array(PackingTravelerProgress),
    /** Travelers with every item packed (0 while there are no items). */
    ready: z.number().int(),
  })
  .openapi('PackingList');
export type PackingList = z.infer<typeof PackingList>;

export const CreatePackingItemRequest = z
  .object({ name: PackingItemName, note: PackingNote.default('') })
  .openapi('CreatePackingItemRequest');
export type CreatePackingItemRequest = z.infer<typeof CreatePackingItemRequest>;

export const UpdatePackingItemRequest = z
  .object({ name: PackingItemName.optional(), note: PackingNote.optional() })
  .openapi('UpdatePackingItemRequest');
export type UpdatePackingItemRequest = z.infer<typeof UpdatePackingItemRequest>;

export const DeletePackingItemResponse = z
  .object({ deleted: z.literal(true), itemId: Id })
  .openapi('DeletePackingItemResponse');
export type DeletePackingItemResponse = z.infer<typeof DeletePackingItemResponse>;

/** One item as a phone sees it: packed or not, for the traveler the caller packs for. */
export const MyPackingItem = z
  .object({
    id: Id,
    name: z.string(),
    note: z.string(),
    packed: z.boolean(),
    packedAt: Timestamp.nullable(),
  })
  .openapi('MyPackingItem');
export type MyPackingItem = z.infer<typeof MyPackingItem>;

/** `GET .../packing/mine`: a traveler's or leader's own list, or a guardian's list for their traveler. */
export const MyPackingList = z
  .object({
    travelerParticipationId: Id,
    travelerName: z.string(),
    /** `self` for a traveler or leader; `guardian` when packing for a bound traveler. */
    packingFor: z.enum(['self', 'guardian']),
    items: z.array(MyPackingItem),
    packed: z.number().int(),
    total: z.number().int(),
  })
  .openapi('MyPackingList');
export type MyPackingList = z.infer<typeof MyPackingList>;

export const SetPackedRequest = z.object({ packed: z.boolean() }).openapi('SetPackedRequest');
export type SetPackedRequest = z.infer<typeof SetPackedRequest>;
