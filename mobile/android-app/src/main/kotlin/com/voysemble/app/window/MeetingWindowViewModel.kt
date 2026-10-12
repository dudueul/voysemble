// Copyright 2026- At Day. All rights reserved.
// Meeting window state holder (D15, slice 029). Live with a client and a trip: the current window
// from the API, the traveler's switch judges one fix on the device (core rule) and sends only the
// state; while sharing, the state is re-judged and re-sent on a timer so the server never reads it
// as stale. A coordinate never leaves the device. Without a trip: the fixture with a fixed clock.

package com.voysemble.app.window

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
import com.voysemble.core.api.MeetingWindowDto
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.session.ActiveTrip
import com.voysemble.core.window.LocationSource
import com.voysemble.core.window.MeetingWindow
import com.voysemble.core.window.currentWindowOf
import com.voysemble.core.window.judgeWindowStateFor
import com.voysemble.core.window.optIn
import com.voysemble.core.window.optOut
import com.voysemble.core.window.toMeetingWindow
import com.voysemble.core.window.windowStateOf
import com.voysemble.core.window.withSelfState
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

data class MeetingWindowUiState(
    /** Null when no window is open or scheduled for this trip. */
    val window: MeetingWindow?,
    val now: String,
    val live: Boolean = false,
    val syncing: Boolean = false,
    val error: String? = null,
)

class MeetingWindowViewModel(
    private val api: ApiClient? = null,
    private val trip: ActiveTrip? = null,
    private val locationSource: LocationSource? = null,
    initial: MeetingWindow? = if (trip == null) KoreaConcertTourFixture.meetingWindow() else null,
    /** Injected so tests and screenshots are deterministic. */
    private val deviceClock: () -> String = { "10:52" },
    /** Re-judge and refresh cadence while the screen lives; tests pass Long.MAX_VALUE to switch it off. */
    private val tickMs: Long = 60_000,
) : ViewModel() {
    private val _state = MutableStateFlow(MeetingWindowUiState(initial, deviceClock(), live = trip != null && api != null))
    val state: StateFlow<MeetingWindowUiState> = _state

    /** The wire window behind the screen model: the meeting point and the id live here, never in the UI state. */
    private var current: MeetingWindowDto? = null

    /** The first fetch (live mode); completed at once in sample mode. Tests await it. */
    val ready: Job = if (_state.value.live) refresh() else completed()

    init {
        if (_state.value.live) viewModelScope.launch {
            while (isActive) {
                delay(tickMs)
                if (_state.value.window?.selfOptedIn == true) report().join()
                refresh().join()
            }
        }
    }

    fun refresh(): Job {
        val a = api ?: return completed()
        val t = trip ?: return completed()
        _state.update { it.copy(syncing = true, error = null) }
        return viewModelScope.launch {
            when (val r = a.listWindows(t.organizationId, t.tripId)) {
                is ApiResult.Ok -> {
                    val dto = currentWindowOf(r.value.windows)
                    current = dto
                    _state.update { it.copy(window = dto?.toMeetingWindow(t.participationId, ::localTime), now = deviceClock(), syncing = false) }
                }
                is ApiResult.Failed -> _state.update {
                    it.copy(syncing = false, error = if (r.status == 403) "Guardians do not take part in meeting windows." else "Could not load the meeting window (${r.error.code}).")
                }
                is ApiResult.Unreachable -> _state.update { it.copy(syncing = false, error = "Offline. The window needs one connection.") }
            }
        }
    }

    /**
     * The traveler's switch. Local first (the fixture rule), then in live mode one report: on
     * means judge a fix and send the state; off sends opted_out and the device stops reading fixes.
     */
    fun setSharing(on: Boolean): Job {
        _state.update { it.copy(window = it.window?.let { w -> if (on) w.optIn() else w.optOut() }) }
        return if (on) report() else send("opted_out")
    }

    /** Judge the device's fix now and send the state; uncertain without permission or a fix. */
    fun report(): Job {
        val dto = current ?: return completed()
        return viewModelScope.launch { send(judgeWindowStateFor(locationSource?.fix(), dto)).join() }
    }

    private fun send(state: String): Job {
        val a = api ?: return completed()
        val t = trip ?: return completed()
        val dto = current ?: return completed()
        return viewModelScope.launch {
            when (val r = a.reportWindowState(t.organizationId, t.tripId, dto.id, state)) {
                is ApiResult.Ok -> _state.update { it.copy(window = it.window?.withSelfState(windowStateOf(r.value.state)), error = null) }
                is ApiResult.Failed -> _state.update {
                    it.copy(error = if (r.status == 409) "This window has ended." else "The server refused the report (${r.error.code}).")
                }
                is ApiResult.Unreachable -> _state.update { it.copy(error = "Offline. Your state was not sent.") }
            }
        }
    }

    private fun completed(): Job = Job().also { it.complete() }

    private fun localTime(iso: String): String = try {
        DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(iso))
    } catch (_: Exception) {
        iso
    }

    companion object {
        fun deviceClockNow(): String = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
    }
}
