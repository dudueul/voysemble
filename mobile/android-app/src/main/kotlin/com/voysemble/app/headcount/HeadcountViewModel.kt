// Copyright 2026- At Day. All rights reserved.
// Head count state holder. Owns: the HeadcountSession (core), the device clock string, and in live
// mode the roster load and the push to the server. Rules stay in core. Without a trip it shows the
// fixture (sample mode) and never touches the network.
//
// Live sequence (D14, D25): load the roster → seed the leader's group, all unmarked → push the
// open session once (so the console can watch) → marks stay local → close pushes the whole
// session; a rejection or no network keeps "Pending sync" and `retrySync` pushes again. Closing
// is final on the device whatever the server answered.

package com.voysemble.app.headcount

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
import com.voysemble.core.api.headcountFromRoster
import com.voysemble.core.api.pushHeadcount
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.headcount.HeadcountMark
import com.voysemble.core.headcount.HeadcountSession
import com.voysemble.core.headcount.SyncState
import com.voysemble.core.headcount.close
import com.voysemble.core.headcount.mark
import com.voysemble.core.headcount.togglePresent
import com.voysemble.core.session.ActiveTrip
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.UUID

/** Live-mode progress shown next to the session; sample mode is never loading or syncing. */
data class HeadcountStatus(
    val live: Boolean,
    val loading: Boolean = false,
    val syncing: Boolean = false,
    /** Safe, user-facing text; null when the last step succeeded. */
    val error: String? = null,
    /** Last push outcome from core (`synced`, `already-closed`, `rejected:<status>`, `offline`). */
    val lastPush: String? = null,
)

class HeadcountViewModel(
    private val api: ApiClient? = null,
    private val trip: ActiveTrip? = null,
    initial: HeadcountSession = if (trip == null) KoreaConcertTourFixture.headcountBusA() else EMPTY,
    /** Injected so tests and screenshots are deterministic. */
    private val deviceClock: () -> String = { "06:58" },
    private val newId: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _state = MutableStateFlow(initial)
    val state: StateFlow<HeadcountSession> = _state

    private val _status = MutableStateFlow(HeadcountStatus(live = trip != null && api != null, loading = trip != null && api != null))
    val status: StateFlow<HeadcountStatus> = _status

    /** The first roster load (live mode); completed at once in sample mode. Tests await it. */
    val ready: Job = if (_status.value.live) load() else Job().also { it.complete() }

    fun togglePresent(memberId: String) = _state.update { it.togglePresent(memberId) }
    fun excuse(memberId: String) = _state.update { it.mark(memberId, HeadcountMark.EXCUSED) }
    fun withOtherGroup(memberId: String) = _state.update { it.mark(memberId, HeadcountMark.WITH_OTHER_GROUP) }

    /** Local close first (final), then one push. Returns the push job so tests can await it. */
    fun close(): Job {
        _state.update { it.close(deviceClock()) }
        return push()
    }

    /** For the "Pending sync" chip: push again without changing anything on the device. */
    fun retrySync(): Job = push()

    /** Roster → the leader's own group (whole trip when the leader has none) → open-session push. */
    fun load(): Job {
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        _status.update { it.copy(loading = true, error = null) }
        return viewModelScope.launch {
            when (val r = a.listRoster(t.organizationId, t.tripId)) {
                is ApiResult.Ok -> {
                    val me = r.value.participations.firstOrNull { it.id == t.participationId }
                    _state.value = headcountFromRoster(
                        id = newId(),
                        roster = r.value.participations,
                        groupName = me?.groupName,
                        openedBy = me?.displayName ?: "Leader",
                        openedAtDevice = deviceClock(),
                    )
                    _status.update { it.copy(loading = false) }
                    push().join()
                }
                is ApiResult.Failed -> _status.update {
                    it.copy(loading = false, error = if (r.status == 403) "Only trip leaders and organizers count heads." else "Could not load the roster (${r.error.code}).")
                }
                is ApiResult.Unreachable -> _status.update { it.copy(loading = false, error = "Offline. The roster needs one connection to start a count.") }
            }
        }
    }

    private fun push(): Job {
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        if (_state.value.syncState == SyncState.SYNCED) return Job().also { it.complete() }
        _status.update { it.copy(syncing = true) }
        return viewModelScope.launch {
            val r = pushHeadcount(a, t.organizationId, t.tripId, _state.value)
            // Marks made while the push was in flight win: only the sync flag is taken from the result.
            _state.update { current -> if (r.session.syncState == SyncState.SYNCED && current.closedAtDevice == r.session.closedAtDevice && current.marks == r.session.marks) r.session else current }
            _status.update { it.copy(syncing = false, lastPush = r.outcome, error = if (r.outcome.startsWith("rejected")) "The server refused this count (${r.outcome.substringAfter(':')})." else null) }
        }
    }

    companion object {
        private val EMPTY = HeadcountSession(
            id = "", groupLabel = "", openedBy = "", openedAtDevice = "", closedAtDevice = null,
            members = emptyList(), marks = emptyMap(), syncState = SyncState.PENDING,
        )

        /** Real device clock for live mode; sample mode and tests inject a fixed string. */
        fun deviceClockNow(): String = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
    }
}
