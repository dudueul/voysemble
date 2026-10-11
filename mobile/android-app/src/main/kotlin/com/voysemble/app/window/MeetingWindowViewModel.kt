// Copyright 2026- At Day. All rights reserved.
// Meeting window state holder for a traveler device: opt in/out of the current window. The
// "now" clock is injected for deterministic screenshots; later slices read the device clock.

package com.voysemble.app.window

import androidx.lifecycle.ViewModel
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.window.MeetingWindow
import com.voysemble.core.window.optIn
import com.voysemble.core.window.optOut
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

data class MeetingWindowUiState(val window: MeetingWindow, val now: String)

class MeetingWindowViewModel(
    initial: MeetingWindow = KoreaConcertTourFixture.meetingWindow(),
    now: String = "10:52",
) : ViewModel() {
    private val _state = MutableStateFlow(MeetingWindowUiState(initial, now))
    val state: StateFlow<MeetingWindowUiState> = _state

    fun setSharing(on: Boolean) = _state.update { it.copy(window = if (on) it.window.optIn() else it.window.optOut()) }
}
