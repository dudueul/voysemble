// Copyright 2026- At Day. All rights reserved.
//
// Chat screen model shared by Android and iOS (D22, slice 033): the channel list, one open
// thread, and the local-first send rules (a message shows at once as pending, is replaced by
// the server's copy, or marked failed to retry). Pure Kotlin: no I/O, no clock; the platform
// renders ISO instants through `clock`.

package com.voysemble.core.chat

import com.voysemble.core.api.ChatChannelDto
import com.voysemble.core.api.ChatMessageDto

public data class ChatMessage(
    val id: String,
    val channelId: String,
    val senderName: String,
    val senderRole: String,
    val body: String,
    /** Local, as `clock` rendered it (e.g. "06:41" or "Dec 31, 06:41"). */
    val sentAt: String,
    val mine: Boolean,
    /** Sent from this device, not yet confirmed by the server. */
    val pending: Boolean = false,
    /** The send failed; the person can retry. */
    val failed: Boolean = false,
    /** Slice 065: who removed the message; the body is empty then and the bubble says so. */
    val removedBy: String? = null,
)

public data class ChatChannel(
    val id: String,
    val kind: String,
    val title: String,
    val subtitle: String,
    val unread: Int,
    val lastPreview: String?,
    val lastAt: String?,
)

public data class ChatThread(
    val channel: ChatChannel,
    /** Oldest first; pending and failed local messages stay at the end. */
    val messages: List<ChatMessage>,
    val offline: Boolean = false,
)

public fun ChatMessageDto.toChatMessage(clock: (iso: String) -> String): ChatMessage =
    ChatMessage(id, channelId, senderName, senderRole, body, clock(sentAt), mine, removedBy = removed?.byName)

public fun ChatChannelDto.toChatChannel(clock: (iso: String) -> String): ChatChannel =
    ChatChannel(id, kind, title, subtitle, unread, lastMessage?.body, lastMessage?.let { clock(it.sentAt) })

/** A message typed on this device shows at once, marked pending. */
public fun ChatThread.appendPending(localId: String, body: String, at: String, senderName: String, senderRole: String): ChatThread =
    copy(messages = messages + ChatMessage(localId, channel.id, senderName, senderRole, body.trim(), at, mine = true, pending = true))

/** The server accepted: the pending copy becomes the server's. */
public fun ChatThread.confirm(localId: String, server: ChatMessage): ChatThread =
    copy(messages = messages.map { if (it.id == localId) server else it }, offline = false)

/** The send failed: keep the text, mark it so the person can retry. */
public fun ChatThread.fail(localId: String, offline: Boolean): ChatThread =
    copy(messages = messages.map { if (it.id == localId) it.copy(pending = false, failed = true) else it }, offline = offline)

/** The server's list wins for confirmed messages; local pending and failed ones ride at the end. */
public fun ChatThread.mergeRemote(channel: ChatChannel, remote: List<ChatMessage>): ChatThread {
    val local = messages.filter { it.pending || it.failed }
    return ChatThread(channel, remote + local, offline = false)
}

/** Total unread across channels, for the tab badge. */
public fun List<ChatChannel>.unreadTotal(): Int = sumOf { it.unread }

/** The failed message's text, to put it back in the composer on retry. */
public fun ChatThread.retryText(localId: String): String? = messages.firstOrNull { it.id == localId && it.failed }?.body

public fun ChatThread.remove(localId: String): ChatThread = copy(messages = messages.filterNot { it.id == localId })

/**
 * Who may remove a message (D22, slice 065), the same rule as `canRemoveChatMessage` in the
 * contracts: the sender their own; a leader any message in a group or traveler channel they are
 * in; an owner or organizer any in the trip and guardian channels.
 */
public fun canRemove(channelKind: String, viewerRole: String, mine: Boolean): Boolean = when {
    mine -> true
    viewerRole == "leader" -> channelKind == "group" || channelKind == "traveler"
    viewerRole == "owner" || viewerRole == "organizer" -> channelKind == "trip" || channelKind == "guardian"
    else -> false
}

/** The server kept a tombstone: the text goes, the bubble names who removed it. */
public fun ChatThread.markRemoved(id: String, byName: String): ChatThread =
    copy(messages = messages.map { if (it.id == id) it.copy(body = "", removedBy = byName) else it })
