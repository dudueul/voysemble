// Copyright 2026- At Day. All rights reserved.
// Incident cards for a leader (D17). Owns: the feed, the local-first answer, one send attempt per
// answer, and the roster of pending answers to replay on refresh. Without a trip it shows the
// fixture (sample mode) and never touches the network. Rules stay in core.

package com.voysemble.app.incidents

import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
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
import com.voysemble.core.api.OpenIncidentRequestDto
import com.voysemble.core.api.ParticipationDto
import com.voysemble.core.api.localIncidentCard
import com.voysemble.core.api.openableTravelers

data class IncidentsUiState(
    val feed: IncidentFeed,
    val live: Boolean,
    val syncing: Boolean = false,
    val error: String? = null,
    /** Slice 073: the travelers a leader may name on a card opened by hand; null until asked. */
    val travelers: List<ParticipationDto>? = null,
    val openError: String? = null,
)

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

    /** Slice 073: a leader opens a card by hand; the sample lets anyone try it. */
    val canOpen: Boolean = trip == null || trip.role == "leader"

    /** The roster's travelers of the leader's group (every traveler for a whole-trip leader); the fixture's in sample mode. */
    fun loadTravelers(): Job {
        val a = api
        val t = trip
        if (a == null || t == null) {
            _state.update { it.copy(travelers = KoreaConcertTourFixture.rosterForIncidents()) }
            return Job().also { it.complete() }
        }
        return viewModelScope.launch {
            when (val r = a.listRoster(t.organizationId, t.tripId)) {
                is ApiResult.Ok -> {
                    val mine = r.value.participations.firstOrNull { it.id == t.participationId }?.groupName
                    _state.update { it.copy(travelers = openableTravelers(r.value.participations, mine), openError = null) }
                }
                is ApiResult.Failed -> _state.update { it.copy(openError = trf(Txt.INC_NEW_FAILED, r.error.code)) }
                is ApiResult.Unreachable -> _state.update { it.copy(openError = tr(Txt.COMMON_OFFLINE)) }
            }
        }
    }

    /** Open a card naming travelers: the server's card lands through a refresh; sample mode keeps a local one. */
    fun openIncident(title: String, participationIds: List<String>): Job {
        val text = title.trim()
        if (text.isEmpty() || participationIds.isEmpty()) return Job().also { it.complete() }
        val a = api
        val t = trip
        if (a == null || t == null) {
            val names = (_state.value.travelers ?: emptyList()).filter { it.id in participationIds }.map { it.displayName }
            _state.update {
                it.copy(feed = it.feed.copy(cards = listOf(localIncidentCard("local-${participationIds.joinToString("-")}", text, names, "Kim Daeun", deviceClock())) + it.feed.cards))
            }
            return Job().also { it.complete() }
        }
        return viewModelScope.launch {
            when (val r = a.openIncident(t.organizationId, t.tripId, OpenIncidentRequestDto(text, participationIds))) {
                is ApiResult.Ok -> {
                    _state.update { it.copy(openError = null) }
                    refresh().join()
                }
                is ApiResult.Failed -> _state.update { it.copy(openError = trf(Txt.INC_NEW_FAILED, r.error.code)) }
                is ApiResult.Unreachable -> _state.update { it.copy(openError = tr(Txt.COMMON_OFFLINE)) }
            }
        }
    }

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
                is ApiResult.Failed -> _state.update { it.copy(syncing = false, error = if (r.status == 403) tr(Txt.INC_LEADERS_ONLY) else trf(Txt.INC_LOAD_FAILED, r.error.code)) }
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
                is ApiResult.Failed -> _state.update { it.copy(error = tr(Txt.INC_REFUSED)) }
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
