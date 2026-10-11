// Copyright 2026- At Day. All rights reserved.
//
// Trip contracts. Trips live inside the organization's Durable Object (ADR-0002). Only owners
// and organizers create trips; every member of the organization can list them.

import { z } from '@hono/zod-openapi';
import { CalendarDate, Id, Timestamp } from './common';

export const TripName = z.string().trim().min(1).max(160);
/** IANA zone, e.g. Asia/Seoul. Validated by Intl on the server. */
export const TimeZone = z.string().min(1).max(64);

export const CreateTripRequest = z
  .object({
    name: TripName,
    startsOn: CalendarDate,
    endsOn: CalendarDate,
    timezone: TimeZone.default('Asia/Seoul'),
  })
  .openapi('CreateTripRequest');
export type CreateTripRequest = z.infer<typeof CreateTripRequest>;

export const Trip = z
  .object({
    id: Id,
    organizationId: Id,
    name: TripName,
    startsOn: CalendarDate,
    endsOn: CalendarDate,
    timezone: TimeZone,
    createdAt: Timestamp,
  })
  .openapi('Trip');
export type Trip = z.infer<typeof Trip>;

export const TripList = z.object({ trips: z.array(Trip) }).openapi('TripList');
export type TripList = z.infer<typeof TripList>;
