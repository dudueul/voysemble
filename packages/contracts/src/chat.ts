// Copyright 2026- At Day. All rights reserved.
//
// Chat channels (D22, slice 033). Fixed channels only: the whole trip, one per group, one per
// traveler with their group's leaders, one per guardian with the organizer. No traveler-to-
// traveler messages, no guardian-to-leader messages. Channel ids are derived from the roster, so
// nothing has to be created: `trip`, `group:<name>`, `traveler:<participationId>`,
// `guardian:<participationId>`. Messages live in the organization's Durable Object; the phones
// poll (no sockets yet) and keep nothing beyond the session.

import { z } from '@hono/zod-openapi';
import { Id, Timestamp } from './common';

export const ChatChannelKind = z
  .enum(['trip', 'group', 'traveler', 'guardian'])
  .openapi('ChatChannelKind');
export type ChatChannelKind = z.infer<typeof ChatChannelKind>;

export const ChatSenderRole = z
  .enum(['owner', 'organizer', 'leader', 'traveler', 'guardian'])
  .openapi('ChatSenderRole');
export type ChatSenderRole = z.infer<typeof ChatSenderRole>;

export const ChatMessage = z
  .object({
    id: z.uuid(),
    channelId: z.string(),
    senderName: z.string(),
    senderRole: ChatSenderRole,
    body: z.string(),
    sentAt: Timestamp,
    /** Sent by the caller (so a phone can draw it on the right). */
    mine: z.boolean(),
  })
  .openapi('ChatMessage');
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ChatChannel = z
  .object({
    id: z.string(),
    kind: ChatChannelKind,
    title: z.string(),
    /** Who is in it, in words: "Bus A · 20 travelers · 1 leader", "with Kim", "with the organizer". */
    subtitle: z.string(),
    /** Messages by others since the caller last opened the channel. */
    unread: z.number().int(),
    lastMessage: ChatMessage.nullable(),
  })
  .openapi('ChatChannel');
export type ChatChannel = z.infer<typeof ChatChannel>;

export const ChatChannelList = z
  .object({ channels: z.array(ChatChannel) })
  .openapi('ChatChannelList');
export type ChatChannelList = z.infer<typeof ChatChannelList>;

export const ChatMessageList = z
  .object({
    channel: ChatChannel,
    /** Oldest first, the latest 200. */
    messages: z.array(ChatMessage),
  })
  .openapi('ChatMessageList');
export type ChatMessageList = z.infer<typeof ChatMessageList>;

export const SendChatMessageRequest = z
  .object({ body: z.string().trim().min(1).max(1000) })
  .openapi('SendChatMessageRequest');
export type SendChatMessageRequest = z.infer<typeof SendChatMessageRequest>;

export const TRIP_CHANNEL_ID = 'trip';

export function channelIdFor(kind: ChatChannelKind, key = ''): string {
  if (kind === 'trip') return TRIP_CHANNEL_ID;
  return `${kind}:${key}`;
}

/** `trip` | `group:<name>` | `traveler:<id>` | `guardian:<id>`; null for anything else. */
export function parseChannelId(id: string): { kind: ChatChannelKind; key: string } | null {
  if (id === TRIP_CHANNEL_ID) return { kind: 'trip', key: '' };
  const i = id.indexOf(':');
  if (i <= 0) return null;
  const kind = id.slice(0, i);
  const key = id.slice(i + 1);
  if (!key) return null;
  if (kind === 'group' || kind === 'traveler' || kind === 'guardian') return { kind, key };
  return null;
}

/** Participation ids that may read and write the channel, from the roster (the D22 matrix). */
export function channelMembersOf(
  parsed: { kind: ChatChannelKind; key: string },
  roster: { id: string; role: string; groupName: string | null; guardianOf: string | null }[],
): { members: Set<string>; organizers: boolean; exists: boolean } {
  const leadersOf = (group: string | null) =>
    roster.filter((p) => p.role === 'leader' && (p.groupName === null || p.groupName === group));
  switch (parsed.kind) {
    case 'trip':
      return {
        members: new Set(roster.filter((p) => p.role !== 'guardian').map((p) => p.id)),
        organizers: true,
        exists: true,
      };
    case 'group': {
      const inGroup = roster.filter((p) => p.role === 'traveler' && p.groupName === parsed.key);
      return {
        members: new Set([...inGroup, ...leadersOf(parsed.key)].map((p) => p.id)),
        organizers: false,
        exists: roster.some((p) => p.groupName === parsed.key),
      };
    }
    case 'traveler': {
      const t = roster.find((p) => p.id === parsed.key && p.role === 'traveler');
      if (!t) return { members: new Set(), organizers: false, exists: false };
      return {
        members: new Set([t.id, ...leadersOf(t.groupName).map((p) => p.id)]),
        organizers: false,
        exists: true,
      };
    }
    case 'guardian': {
      const g = roster.find((p) => p.id === parsed.key && p.role === 'guardian');
      if (!g) return { members: new Set(), organizers: false, exists: false };
      return { members: new Set([g.id]), organizers: true, exists: true };
    }
  }
}
