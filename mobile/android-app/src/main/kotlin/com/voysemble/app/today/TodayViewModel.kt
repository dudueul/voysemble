// Copyright 2026- At Day. All rights reserved.
// Today screen state holder. Owns: the TodaySnapshot (from core), local ack queueing, tab
// selection, and in live mode (slice 017) the itinerary fetch that builds today's snapshot from
// the published revision. Rules stay in core. Without a trip it shows the fixture (sample mode).

package com.voysemble.app.today

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
import com.voysemble.core.api.CreateProposalRequestDto
import com.voysemble.core.api.ProposalPatchDto
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.session.ActiveTrip
import com.voysemble.core.today.TodaySnapshot
import com.voysemble.core.today.acknowledgeAnnouncement
import com.voysemble.core.today.todaySnapshotOf
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

enum class MainTab { TODAY, PLAN, BULLETIN, CHATS, MEMORIES }

/** The leader's change proposal in flight (D24): one at a time, result shown on the card. */
data class ProposalState(val eventId: String, val sending: Boolean, val sent: Boolean, val error: String? = null)

data class TodayUiState(
    val snapshot: TodaySnapshot,
    val tab: MainTab = MainTab.TODAY,
    val live: Boolean = false,
    val syncing: Boolean = false,
    val error: String? = null,
    val proposal: ProposalState? = null,
)

class TodayViewModel(
    initial: TodaySnapshot = KoreaConcertTourFixture.today(),
    private val api: ApiClient? = null,
    private val trip: ActiveTrip? = null,
    /** Device date (YYYY-MM-DD) and clock (HH:mm) in the trip's zone; injected for tests. */
    private val deviceDate: (zone: String) -> String = { zone -> LocalDate.now(zoneOf(zone)).toString() },
    private val deviceClock: (zone: String) -> String = { zone -> LocalTime.now(zoneOf(zone)).format(HH_MM) },
) : ViewModel() {
    private val _state = MutableStateFlow(
        TodayUiState(
            snapshot = if (trip != null && api != null) emptySnapshot(trip) else initial,
            live = trip != null && api != null,
        ),
    )
    val state: StateFlow<TodayUiState> = _state

    /** The first itinerary fetch (live mode); completed at once in sample mode. Tests await it. */
    val ready: Job = if (_state.value.live) refresh() else Job().also { it.complete() }

    fun acknowledge(announcementId: String) {
        _state.update { it.copy(snapshot = it.snapshot.acknowledgeAnnouncement(announcementId)) }
    }

    fun selectTab(tab: MainTab) {
        _state.update { it.copy(tab = tab) }
    }

    /**
     * Propose a change to an event (D24): a new start time and/or a note for the organizer. The
     * draft is untouched until the organizer accepts. Sample mode shows the sent state without a
     * network call. Returns the job so tests can await it.
     */
    fun propose(eventId: String, newStart: String?, note: String): Job {
        val a = api
        val t = trip
        if (a == null || t == null) {
            _state.update { it.copy(proposal = ProposalState(eventId, sending = false, sent = true)) }
            return Job().also { it.complete() }
        }
        _state.update { it.copy(proposal = ProposalState(eventId, sending = true, sent = false)) }
        return viewModelScope.launch {
            val body = CreateProposalRequestDto(
                kind = "edit",
                eventId = eventId,
                patch = ProposalPatchDto(start = newStart?.takeIf { it.isNotBlank() }),
                note = note.trim(),
            )
            when (val r = a.createProposal(t.organizationId, t.tripId, body)) {
                is ApiResult.Ok -> _state.update { it.copy(proposal = ProposalState(eventId, sending = false, sent = true)) }
                is ApiResult.Failed -> _state.update { it.copy(proposal = ProposalState(eventId, sending = false, sent = false, error = if (r.status == 403) "Only trip leaders propose changes." else "Could not send the proposal (${r.error.code}).")) }
                is ApiResult.Unreachable -> _state.update { it.copy(proposal = ProposalState(eventId, sending = false, sent = false, error = "Offline. Try again when connected.")) }
            }
        }
    }

    fun dismissProposal() {
        _state.update { it.copy(proposal = null) }
    }

    fun refresh(): Job {
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        _state.update { it.copy(syncing = true, error = null) }
        return viewModelScope.launch {
            when (val r = a.getItinerary(t.organizationId, t.tripId)) {
                is ApiResult.Ok -> {
                    val zone = r.value.days.firstOrNull()?.timeZone ?: "UTC"
                    _state.update {
                        it.copy(
                            snapshot = todaySnapshotOf(r.value, deviceDate(zone), deviceClock(zone), minutesSinceSync = 0),
                            syncing = false,
                        )
                    }
                }
                is ApiResult.Failed -> _state.update { it.copy(syncing = false, error = "Could not load the itinerary (${r.error.code}).") }
                is ApiResult.Unreachable -> _state.update { it.copy(syncing = false, snapshot = it.snapshot.copy(offline = true)) }
            }
        }
    }

    companion object {
        private val HH_MM: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

        private fun zoneOf(zone: String): ZoneId = try { ZoneId.of(zone) } catch (_: Exception) { ZoneId.systemDefault() }

        /** Shown until the first itinerary answer: the trip name, nothing else invented. */
        private fun emptySnapshot(trip: ActiveTrip): TodaySnapshot = TodaySnapshot(
            tripName = trip.tripName.ifBlank { "Your trip" },
            dayNumber = 0,
            dateLabel = "",
            timeZoneLabel = "",
            now = "00:00",
            events = emptyList(),
            announcement = null,
            headcount = emptyList(),
            minutesSinceSync = null,
            offline = false,
        )
    }
}
