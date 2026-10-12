// Copyright 2026- At Day. All rights reserved.
//
// Chat channels (D22, slice 033). The viewer is a participation on the trip (phones) or an
// owner/organizer account without one (console). Channels are derived from the roster; the
// Durable Object checks membership on every read and write (the D22 matrix in
// `channelMembersOf`). Opening a channel marks it read; the phones poll the list. Slice 064: the
// cards' words follow the caller's account language, and an organizer may read (never write) a
// group or traveler channel while an open incident names one of its travelers; that read is a
// fact on every traveler's timeline in the channel. Slice 065: a message can be removed by its
// sender, by a leader in their group's channels, by the organizer in theirs; a tombstone stays.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  ChatChannelList,
  ChatMessage,
  ChatMessageList,
  SendChatMessageRequest,
} from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth, requireOrgRole } from '../auth/middleware';
import type { AppEnv, AuthContext } from '../env';
import { nowIso } from '../lib/time';
import { orgObject } from '../org/client';
import type { ChatViewer, OrgDurableObject } from '../org/OrgDurableObject';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const ChannelParams = TripParams.extend({ channelId: z.string().min(1).max(120) });
const MessageParams = ChannelParams.extend({ messageId: z.uuid() });

const listRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/chats',
  tags: ['chat'],
  summary: "The caller's channels (D22), with unread counts and the latest message",
  description:
    'Organizer: the whole trip and one channel per guardian. Leader: the trip, their group(s), one channel per traveler of their group. Traveler: the trip, their group, their leaders. Guardian: the organizer.',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: { description: 'Channels.', content: { 'application/json': { schema: ChatChannelList } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const messagesRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/chats/{channelId}/messages',
  tags: ['chat'],
  summary: 'The latest 200 messages of a channel (oldest first); marks the channel read',
  description:
    "Members read their channels. An owner or organizer may also read a group or traveler channel while an open incident names a traveler in it (D22): the answer carries `audited` and the read lands on every traveler's timeline in the channel. Writing there stays 403.",
  security: SESSION_SECURITY,
  request: { params: ChannelParams },
  responses: {
    200: { description: 'Messages.', content: { 'application/json': { schema: ChatMessageList } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const sendRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/chats/{channelId}/messages',
  tags: ['chat'],
  summary: 'Send a message to a channel the caller belongs to',
  security: SESSION_SECURITY,
  request: {
    params: ChannelParams,
    body: { content: { 'application/json': { schema: SendChatMessageRequest } } },
  },
  responses: {
    201: {
      description: 'The stored message.',
      content: { 'application/json': { schema: ChatMessage } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const removeRoute = createRoute({
  method: 'delete',
  path: '/v1/orgs/{orgId}/trips/{tripId}/chats/{channelId}/messages/{messageId}',
  tags: ['chat'],
  summary:
    'Remove a message: your own, any in your group as its leader, any in your channels as the organizer',
  description:
    'D22 moderation (slice 065). The sender removes their own message; a leader any message in a group or traveler channel they are in; an owner or organizer any message in the trip and guardian channels. The message stays as a tombstone (who removed it, when) with its text gone; everyone in the channel sees it. Removing it again answers the same tombstone.',
  security: SESSION_SECURITY,
  request: { params: MessageParams },
  responses: {
    200: {
      description: 'The tombstone.',
      content: { 'application/json': { schema: ChatMessage } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

async function viewerFor(
  env: Env,
  auth: AuthContext,
  orgId: string,
  tripId: string,
): Promise<{ org: DurableObjectStub<OrgDurableObject>; viewer: ChatViewer }> {
  const access = await requireOrgRole(env, auth, orgId, 'member');
  const org = await orgObject(env, orgId);
  if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
  const me = await org.participationForAccount(tripId, auth.accountId);
  const organizer = access.role === 'owner' || access.role === 'organizer';
  if (!me && !organizer) throw new HTTPException(403, { message: 'Not on this trip.' });
  const viewer: ChatViewer = {
    readerKey: me?.id ?? `acct:${auth.accountId}`,
    participation: me,
    organizer,
    name: me?.displayName ?? (access.role === 'owner' ? 'Owner' : 'Organizer'),
    role: me ? (me.role as ChatViewer['role']) : access.role === 'owner' ? 'owner' : 'organizer',
    locale: auth.locale,
  };
  return { org, viewer };
}

function fail(r: { forbidden: true } | { notFound: true }): never {
  if ('notFound' in r) throw new HTTPException(404, { message: 'Channel not found.' });
  throw new HTTPException(403, { message: 'Not a member of this channel.' });
}

export function mountChatRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const { org, viewer } = await viewerFor(c.env, auth, orgId, tripId);
    return c.json({ channels: await org.chatChannels(tripId, viewer) }, 200);
  });

  app.openapi(messagesRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, channelId } = c.req.valid('param');
    const { org, viewer } = await viewerFor(c.env, auth, orgId, tripId);
    const r = await org.chatMessages(tripId, channelId, viewer, nowIso());
    if ('forbidden' in r || 'notFound' in r) fail(r);
    return c.json(r, 200);
  });

  app.openapi(sendRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, channelId } = c.req.valid('param');
    const { body } = c.req.valid('json');
    const { org, viewer } = await viewerFor(c.env, auth, orgId, tripId);
    const r = await org.sendChatMessage(tripId, channelId, viewer, body, nowIso());
    if ('forbidden' in r || 'notFound' in r) fail(r);
    return c.json(r, 201);
  });

  app.openapi(removeRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, channelId, messageId } = c.req.valid('param');
    const { org, viewer } = await viewerFor(c.env, auth, orgId, tripId);
    const r = await org.removeChatMessage(tripId, channelId, messageId, viewer, nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: 'Message not found.' });
    if ('forbidden' in r) {
      throw new HTTPException(403, { message: 'You cannot remove this message.' });
    }
    return c.json(r, 200);
  });
}
