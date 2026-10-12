// Copyright 2026- At Day. All rights reserved.
//
// Chat channels on the wire (D22, slice 033). Channel ids are derived by the server from the
// roster (`trip`, `group:<name>`, `traveler:<id>`, `guardian:<id>`); the phone never builds one.

package com.voysemble.core.api

import kotlinx.serialization.Serializable

@Serializable
public data class ChatMessageDto(
    val id: String,
    val channelId: String,
    val senderName: String,
    /** owner | organizer | leader | traveler | guardian */
    val senderRole: String,
    val body: String,
    val sentAt: String,
    val mine: Boolean,
    /** Slice 065: present when the message was removed; the body is empty then. */
    val removed: ChatRemovalDto? = null,
)

/** Who removed a message and when (slice 065). */
@Serializable
public data class ChatRemovalDto(val byName: String, val at: String)

@Serializable
public data class ChatChannelDto(
    val id: String,
    /** trip | group | traveler | guardian */
    val kind: String,
    val title: String,
    val subtitle: String,
    val unread: Int,
    val lastMessage: ChatMessageDto? = null,
)

@Serializable
public data class ChatChannelListDto(val channels: List<ChatChannelDto>)

@Serializable
public data class ChatMessageListDto(val channel: ChatChannelDto, val messages: List<ChatMessageDto>)

@Serializable
public data class SendChatMessageRequestDto(val body: String)
