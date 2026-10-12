// Copyright 2026- At Day. All rights reserved.
// Chats state holder (D22, slice 033). Live with a client and a trip: the channel list from the
// API, one open thread, local-first sends (pending, then the server's copy, or failed to retry),
// and a poll every 15 seconds for whatever is on screen (no sockets yet). Without a trip the
// fixture (sample mode). Slice 065: a message is removed (own, or any as the channel's leader);
// the server keeps a tombstone and the thread shows it. Rules in core (chat/ChatModel.kt).

package com.voysemble.app.chat

import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
import com.voysemble.core.chat.ChatChannel
import com.voysemble.core.chat.ChatThread
import com.voysemble.core.chat.appendPending
import com.voysemble.core.chat.confirm
import com.voysemble.core.chat.fail
import com.voysemble.core.chat.markRemoved
import com.voysemble.core.chat.mergeRemote
import com.voysemble.core.chat.remove
import com.voysemble.core.chat.retryText
import com.voysemble.core.chat.toChatChannel
import com.voysemble.core.chat.toChatMessage
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.session.ActiveTrip
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID

data class ChatsUiState(
    val channels: List<ChatChannel>,
    /** The open thread, or null on the channel list. */
    val open: ChatThread? = null,
    val live: Boolean = false,
    val syncing: Boolean = false,
    val error: String? = null,
)

class ChatsViewModel(
    private val api: ApiClient? = null,
    private val trip: ActiveTrip? = null,
    initial: List<ChatChannel> = if (trip == null) KoreaConcertTourFixture.chats() else emptyList(),
    /** Injected so tests and screenshots are deterministic. */
    private val deviceClock: () -> String = { LocalTime.now().format(HH_MM) },
    private val newId: () -> String = { "local-${UUID.randomUUID()}" },
    /** Poll cadence while the tab is on screen; tests pass Long.MAX_VALUE to switch it off. */
    private val tickMs: Long = 15_000,
    private val senderName: String = tr(Txt.COMMON_ME),
) : ViewModel() {
    private val _state = MutableStateFlow(ChatsUiState(initial, live = trip != null && api != null))
    val state: StateFlow<ChatsUiState> = _state

    /** The reader's role on the trip, for who may remove what (core `canRemove`). */
    val role: String = trip?.role ?: "traveler"

    /** The first list fetch (live mode); completed at once in sample mode. Tests await it. */
    val ready: Job = if (_state.value.live) refresh() else completed()

    init {
        if (_state.value.live) viewModelScope.launch {
            while (isActive) {
                delay(tickMs)
                refresh().join()
            }
        }
    }

    /** The list, or the open thread, whichever is on screen. */
    fun refresh(): Job {
        val a = api ?: return completed()
        val t = trip ?: return completed()
        val open = _state.value.open
        _state.update { it.copy(syncing = true) }
        return viewModelScope.launch {
            if (open == null) {
                when (val r = a.listChats(t.organizationId, t.tripId)) {
                    is ApiResult.Ok -> _state.update { it.copy(channels = r.value.channels.map { c -> c.toChatChannel(::localTime) }, syncing = false, error = null) }
                    is ApiResult.Failed -> _state.update { it.copy(syncing = false, error = trf(Txt.CHAT_LOAD_FAILED, r.error.code)) }
                    is ApiResult.Unreachable -> _state.update { it.copy(syncing = false, error = tr(Txt.CHAT_OFFLINE)) }
                }
            } else {
                when (val r = a.chatMessages(t.organizationId, t.tripId, open.channel.id)) {
                    is ApiResult.Ok -> _state.update {
                        val thread = it.open ?: return@update it.copy(syncing = false)
                        it.copy(open = thread.mergeRemote(r.value.channel.toChatChannel(::localTime), r.value.messages.map { m -> m.toChatMessage(::localTime) }), syncing = false, error = null)
                    }
                    is ApiResult.Failed -> _state.update { it.copy(syncing = false, error = if (r.status == 403) tr(Txt.CHAT_NOT_MEMBER) else trf(Txt.CHAT_MESSAGES_FAILED, r.error.code)) }
                    is ApiResult.Unreachable -> _state.update { it.copy(syncing = false, open = it.open?.copy(offline = true)) }
                }
            }
        }
    }

    /** Open a channel: sample mode shows the fixture thread; live fetches (and marks it read). */
    fun open(channelId: String): Job {
        val channel = _state.value.channels.firstOrNull { it.id == channelId } ?: return completed()
        if (!_state.value.live) {
            _state.update { it.copy(open = KoreaConcertTourFixture.chatThread().let { t -> if (t.channel.id == channelId) t else ChatThread(channel, emptyList()) }) }
            return completed()
        }
        _state.update { it.copy(open = ChatThread(channel, emptyList()), channels = it.channels.map { c -> if (c.id == channelId) c.copy(unread = 0) else c }) }
        return refresh()
    }

    fun close() = _state.update { it.copy(open = null, error = null) }

    /** Local first (pending), then one send; a failure keeps the text as failed for retry. */
    fun send(body: String): Job {
        val text = body.trim()
        if (text.isEmpty()) return completed()
        val localId = newId()
        _state.update { it.copy(open = it.open?.appendPending(localId, text, deviceClock(), senderName, trip?.role ?: "traveler")) }
        val a = api ?: return completed()
        val t = trip ?: return completed()
        val channelId = _state.value.open?.channel?.id ?: return completed()
        return viewModelScope.launch {
            when (val r = a.sendChatMessage(t.organizationId, t.tripId, channelId, text)) {
                is ApiResult.Ok -> _state.update { it.copy(open = it.open?.confirm(localId, r.value.toChatMessage(::localTime))) }
                is ApiResult.Failed -> _state.update { it.copy(open = it.open?.fail(localId, offline = false), error = if (r.status == 403) tr(Txt.CHAT_NOT_MEMBER) else trf(Txt.CHAT_REFUSED, r.error.code)) }
                is ApiResult.Unreachable -> _state.update { it.copy(open = it.open?.fail(localId, offline = true)) }
            }
        }
    }

    /** Remove a message (own, or any in a group or traveler channel as its leader): the server keeps a tombstone. */
    fun remove(messageId: String): Job {
        val open = _state.value.open ?: return completed()
        val target = open.messages.firstOrNull { it.id == messageId } ?: return completed()
        if (!_state.value.live) {
            _state.update { it.copy(open = it.open?.markRemoved(messageId, if (target.mine) target.senderName else senderName)) }
            return completed()
        }
        val a = api ?: return completed()
        val t = trip ?: return completed()
        return viewModelScope.launch {
            when (val r = a.removeChatMessage(t.organizationId, t.tripId, open.channel.id, messageId)) {
                is ApiResult.Ok -> _state.update { it.copy(open = it.open?.markRemoved(messageId, r.value.removed?.byName ?: senderName), error = null) }
                is ApiResult.Failed -> _state.update { it.copy(error = trf(Txt.CHAT_REMOVE_FAILED, r.error.code)) }
                is ApiResult.Unreachable -> _state.update { it.copy(error = tr(Txt.CHAT_OFFLINE)) }
            }
        }
    }

    /** Retry a failed message: remove the failed copy and send its text again. */
    fun retry(localId: String): Job {
        val text = _state.value.open?.retryText(localId) ?: return completed()
        _state.update { it.copy(open = it.open?.remove(localId)) }
        return send(text)
    }

    private fun completed(): Job = Job().also { it.complete() }

    private fun localTime(iso: String): String = try {
        HH_MM.withZone(ZoneId.systemDefault()).format(Instant.parse(iso))
    } catch (_: Exception) {
        iso
    }

    companion object {
        private val HH_MM: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
    }
}
