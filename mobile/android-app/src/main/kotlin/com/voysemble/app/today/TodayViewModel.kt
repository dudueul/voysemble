// Copyright 2026- At Day. All rights reserved.
// Today screen state holder. Owns: the TodaySnapshot (from core), local ack queueing, tab
// selection, and in live mode (slice 017) the itinerary fetch that builds today's snapshot from
// the published revision. Rules stay in core. Without a trip it shows the fixture (sample mode).

package com.voysemble.app.today

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
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

data class TodayUiState(
    val snapshot: TodaySnapshot,
    val tab: MainTab = MainTab.TODAY,
    val live: Boolean = false,
    val syncing: Boolean = false,
    val error: String? = null,
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
