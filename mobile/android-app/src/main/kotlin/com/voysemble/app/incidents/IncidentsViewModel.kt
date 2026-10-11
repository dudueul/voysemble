// Copyright 2026- At Day. All rights reserved.
// Incident cards for a leader (D17). Owns: the feed, the local-first answer, one send attempt per
// answer, and the roster of pending answers to replay on refresh. Without a trip it shows the
// fixture (sample mode) and never touches the network. Rules stay in core.

package com.voysemble.app.incidents

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
import com.voysemble.core.api.ConfirmIncidentRequestDto
import com.voysemble.core.api.mergeIncidents
import com.voysemble.core.api.wireName
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.incidents.ConfirmationStatus
import com.voysemble.core.incidents.IncidentFeed
import com.voysemble.core.incidents.confirmLocally
import com.voysemble.core.incidents.confirmed
import com.voysemble.core.session.ActiveTrip
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

data class IncidentsUiState(val feed: IncidentFeed, val live: Boolean, val syncing: Boolean = false, val error: String? = null)

class IncidentsViewModel(
    private val api: ApiClient? = null,
    private val trip: ActiveTrip? = null,
    initial: IncidentFeed = if (trip == null) KoreaConcertTourFixture.incidents() else IncidentFeed(emptyList(), offline = false),
    /** Injected so tests and screenshots are deterministic. */
    private val deviceClock: () -> String = { "07:12" },
    private val locale: String = Locale.getDefault().language,
) : ViewModel() {
    private val _state = MutableStateFlow(IncidentsUiState(initial, live = trip != null && api != null))
    val state: StateFlow<IncidentsUiState> = _state

    /** The first fetch (live mode); completed at once in sample mode. Tests await it. */
    val ready: Job = if (_state.value.live) refresh() else Job().also { it.complete() }

    /** Local first (pending), then one send; a failed send leaves the answer pending for the next refresh. */
    fun confirm(id: String, status: ConfirmationStatus, note: String?): Job {
        val byName = trip?.let { "Me" } ?: "Kim Daeun"
        _state.update { it.copy(feed = it.feed.confirmLocally(id, status, note, byName, deviceClock())) }
        return send(id)
    }

    fun refresh(): Job {
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        _state.update { it.copy(syncing = true, error = null) }
        return viewModelScope.launch {
            // Replay pending answers first so the merge below reflects them.
            for (card in _state.value.feed.cards.filter { it.pending != null }) send(card.id).join()
            when (val r = a.listIncidents(t.organizationId, t.tripId)) {
                is ApiResult.Ok -> _state.update { it.copy(feed = mergeIncidents(it.feed, r.value.incidents, ::localTime, locale), syncing = false) }
                is ApiResult.Failed -> _state.update { it.copy(syncing = false, error = if (r.status == 403) "Only trip leaders see incidents." else "Could not load incidents (${r.error.code}).") }
                is ApiResult.Unreachable -> _state.update { it.copy(feed = it.feed.copy(offline = true), syncing = false) }
            }
        }
    }

    private fun send(id: String): Job {
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        val pending = _state.value.feed.cards.firstOrNull { it.id == id }?.pending ?: return Job().also { it.complete() }
        return viewModelScope.launch {
            when (a.confirmIncident(t.organizationId, t.tripId, id, ConfirmIncidentRequestDto(pending.status.wireName(), pending.note))) {
                is ApiResult.Ok -> _state.update { it.copy(feed = it.feed.confirmed(id), error = null) }
                is ApiResult.Failed -> _state.update { it.copy(error = "The server refused the answer.") }
                is ApiResult.Unreachable -> _state.update { it.copy(feed = it.feed.copy(offline = true)) }
            }
        }
    }

    private fun localTime(iso: String): String = try {
        DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(iso))
    } catch (_: Exception) {
        iso
    }

    companion object {
        fun deviceClockNow(): String = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
    }
}
