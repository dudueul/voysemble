// Copyright 2026- At Day. All rights reserved.
// Notification inbox state holder (D29, slice 053). Live with a client and a trip: my inbox from
// the API (what the lanes delivered by now, newest first), a read flipped on the phone first and
// confirmed by the server's row (a failure puts it back and says so; offline keeps the local read
// and says so). Without a trip: the fixture inbox. Rules in core (notifications/InboxModel.kt).
// The delivery instant becomes "HH:mm" today and "MM-dd HH:mm" before, in the phone's zone.

package com.voysemble.app.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
import com.voysemble.core.notifications.Inbox
import com.voysemble.core.notifications.emptyInbox
import com.voysemble.core.notifications.inboxItemOf
import com.voysemble.core.notifications.inboxOf
import com.voysemble.core.notifications.replaceItem
import com.voysemble.core.notifications.withOffline
import com.voysemble.core.notifications.withRead
import com.voysemble.core.session.ActiveTrip
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class InboxUiState(
    val inbox: Inbox,
    val live: Boolean = false,
    val syncing: Boolean = false,
    val error: String? = null,
    /** One line after a read that did not reach the server. */
    val notice: String? = null,
    /** Rows whose read is on its way; they are disabled meanwhile. */
    val pending: Set<String> = emptySet(),
    /** Slice 061: the reader's role decides where a row can lead (sample mode is the leader's view). */
    val role: String = "leader",
)

class InboxViewModel(
    initial: Inbox = KoreaConcertTourFixture.inbox(),
    private val api: ApiClient? = null,
    private val trip: ActiveTrip? = null,
    private val clock: (iso: String) -> String = { iso -> deviceLabel(iso) },
) : ViewModel() {
    private val live = api != null && trip != null
    private val _state = MutableStateFlow(InboxUiState(inbox = if (live) emptyInbox() else initial, live = live, role = trip?.role ?: "leader"))
    val state: StateFlow<InboxUiState> = _state

    /** The first inbox (live); completed at once in sample mode. Tests await it. */
    val ready: Job = if (live) refresh() else Job().also { it.complete() }

    fun refresh(): Job {
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        _state.update { it.copy(syncing = true) }
        return viewModelScope.launch {
            when (val r = a.myNotifications(t.organizationId, t.tripId)) {
                is ApiResult.Ok -> _state.update { it.copy(inbox = inboxOf(r.value, clock), syncing = false, error = null) }
                is ApiResult.Failed -> _state.update { it.copy(syncing = false, error = trf(Txt.INBOX_LOAD_FAILED, r.error.code)) }
                is ApiResult.Unreachable -> _state.update { it.copy(inbox = it.inbox.withOffline(true), syncing = false, error = tr(Txt.INBOX_OFFLINE)) }
            }
        }
    }

    /** Flip locally first; the server's row replaces it, a failure puts the old one back. */
    fun markRead(id: String): Job {
        val before = _state.value.inbox.items.firstOrNull { it.id == id }
        if (before == null || before.read) return Job().also { it.complete() }
        _state.update { it.copy(inbox = it.inbox.withRead(id), notice = null) }
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        _state.update { it.copy(pending = it.pending + id) }
        return viewModelScope.launch {
            val r = a.markNotificationRead(t.organizationId, t.tripId, id)
            _state.update { s ->
                val done = s.pending - id
                when (r) {
                    is ApiResult.Ok -> s.copy(inbox = s.inbox.replaceItem(inboxItemOf(r.value, clock)), pending = done)
                    is ApiResult.Failed -> s.copy(inbox = s.inbox.replaceItem(before), notice = trf(Txt.INBOX_READ_FAILED, r.error.code), pending = done)
                    // Offline keeps the local read (the server's row is unread until the next sync) and says so.
                    is ApiResult.Unreachable -> s.copy(inbox = s.inbox.withOffline(true), notice = tr(Txt.INBOX_READ_OFFLINE), pending = done)
                }
            }
        }
    }

    companion object {
        private val HH_MM: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
        private val MM_DD_HH_MM: DateTimeFormatter = DateTimeFormatter.ofPattern("MM-dd HH:mm")

        /** "06:52" when the instant falls on the phone's current date, "12-30 21:05" otherwise; the input when unparseable. */
        fun deviceLabel(iso: String, zone: ZoneId = ZoneId.systemDefault(), today: LocalDate = LocalDate.now(zone)): String = try {
            val at = Instant.parse(iso).atZone(zone)
            if (at.toLocalDate() == today) HH_MM.format(at) else MM_DD_HH_MM.format(at)
        } catch (_: Exception) {
            iso
        }
    }
}
