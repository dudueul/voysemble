// Copyright 2026- At Day. All rights reserved.
//
// Notification lanes (D29, slice 052). Every event that someone on the trip should hear about
// (an announcement, a head-count call, an incident's status, a decided proposal) becomes one
// notification per recipient in one lane: priority (at once, through quiet hours), normal (at
// once, or when quiet hours end) or digest (at the organization's digest hour). The phone reads
// its own inbox; the console reads the log of what went out. A notification carries a title, a
// short body and a reference, never a location or a care fact.

import { z } from '@hono/zod-openapi';
import { Id, Timestamp } from './common';

export const NotificationLane = z
  .enum(['priority', 'normal', 'digest'])
  .openapi('NotificationLane');
export type NotificationLane = z.infer<typeof NotificationLane>;

export const NotificationKind = z
  .enum([
    'announcement',
    'itinerary_revision',
    'headcount_call',
    'incident_status',
    'proposal_decided',
  ])
  .openapi('NotificationKind');
export type NotificationKind = z.infer<typeof NotificationKind>;

export const Notification = z
  .object({
    id: Id,
    tripId: Id,
    lane: NotificationLane,
    kind: NotificationKind,
    title: z.string(),
    body: z.string(),
    /** What to open: an announcement, a head count, an incident, a proposal. */
    refType: z.enum(['announcement', 'headcount', 'incident', 'proposal']),
    refId: z.string(),
    createdAt: Timestamp,
    /** When the lane delivers it; the normal lane waits for quiet hours to end, the digest for its hour. */
    deliverAt: Timestamp,
    readAt: Timestamp.nullable(),
  })
  .openapi('Notification');
export type Notification = z.infer<typeof Notification>;

/** `GET .../notifications/mine`: what has been delivered to the caller, newest first. */
export const MyNotifications = z
  .object({ notifications: z.array(Notification), unread: z.number().int() })
  .openapi('MyNotifications');
export type MyNotifications = z.infer<typeof MyNotifications>;

/** One event as the organizer sees it: how many went in each lane, how many wait for quiet hours. */
export const NotificationEvent = z
  .object({
    createdAt: Timestamp,
    kind: NotificationKind,
    title: z.string(),
    refType: z.enum(['announcement', 'headcount', 'incident', 'proposal']),
    refId: z.string(),
    lanes: z.object({
      priority: z.number().int(),
      normal: z.number().int(),
      digest: z.number().int(),
    }),
    /** Normal-lane notifications still waiting for quiet hours to end at the time of the read. */
    held: z.number().int(),
    recipients: z.number().int(),
  })
  .openapi('NotificationEvent');
export type NotificationEvent = z.infer<typeof NotificationEvent>;

export const NotificationLog = z
  .object({ events: z.array(NotificationEvent) })
  .openapi('NotificationLog');
export type NotificationLog = z.infer<typeof NotificationLog>;
