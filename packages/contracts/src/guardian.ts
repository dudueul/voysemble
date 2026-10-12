// Copyright 2026- At Day. All rights reserved.
//
// The guardian's view of their traveler (D13, slice 025): status, never coordinates. One object
// answers the only three questions a parent asks: was my child counted, is anything going on,
// and which plan is current. Nothing here names other travelers or carries a location.

import { z } from '@hono/zod-openapi';
import { Id, Timestamp } from './common';
import { GuardianFee } from './fees';
import { GuardianMessage, IncidentKind, IncidentStatus } from './incident';
import { DisplayName, GroupName } from './roster';

/** The traveler's mark on the latest head count that covered them (D14, D25). */
export const TravelerCountStatus = z
  .enum(['not_counted', 'present', 'missing', 'with_other_group', 'excused'])
  .openapi('TravelerCountStatus');
export type TravelerCountStatus = z.infer<typeof TravelerCountStatus>;

export const GuardianStatus = z
  .object({
    traveler: z.object({
      participationId: Id,
      displayName: DisplayName,
      groupName: GroupName.nullable(),
    }),
    count: z.object({
      status: TravelerCountStatus,
      headcountId: z.uuid().nullable(),
      /** Group of the head count, or null for a whole-trip count. */
      groupLabel: z.string().nullable(),
      closed: z.boolean(),
      /** The leader's device clock at close (or at open while the count is open), HH:mm. */
      atDevice: z.string().nullable(),
      /** Who opened the count. */
      byName: z.string().nullable(),
      receivedAt: Timestamp.nullable(),
    }),
    /**
     * The latest incident naming the traveler; its guardian message once the organizer sent one.
     * Slice 080: its kind, so the card can say "asked for help" (the traveler's own words stay
     * with the traveler and the organizer).
     */
    incident: z
      .object({
        id: z.uuid(),
        status: IncidentStatus,
        kind: IncidentKind,
        openedAt: Timestamp,
        message: GuardianMessage.nullable(),
      })
      .nullable(),
    /** Published itinerary revision the guardian can read; 0 before the first publish. */
    itineraryRevision: z.number().int(),
    /** The traveler's fee as the guardian may see it (D23); null until the organizer sets one. */
    fee: GuardianFee.nullable(),
  })
  .openapi('GuardianStatus');
export type GuardianStatus = z.infer<typeof GuardianStatus>;
