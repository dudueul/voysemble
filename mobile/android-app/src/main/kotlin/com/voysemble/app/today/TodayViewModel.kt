// Copyright 2026- At Day. All rights reserved.
// Today screen state holder. Owns: the TodaySnapshot (from core), local ack queueing, tab
// selection. Must not: compute business rules (core does), call the network (sync slice later).

package com.voysemble.app.today

import androidx.lifecycle.ViewModel
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.today.TodaySnapshot
import com.voysemble.core.today.acknowledgeAnnouncement
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

enum class MainTab { TODAY, PLAN, BULLETIN, CHATS, MEMORIES }

data class TodayUiState(
    val snapshot: TodaySnapshot,
    val tab: MainTab = MainTab.TODAY,
)

class TodayViewModel(initial: TodaySnapshot = KoreaConcertTourFixture.today()) : ViewModel() {
    private val _state = MutableStateFlow(TodayUiState(initial))
    val state: StateFlow<TodayUiState> = _state

    fun acknowledge(announcementId: String) {
        _state.update { it.copy(snapshot = it.snapshot.acknowledgeAnnouncement(announcementId)) }
    }

    fun selectTab(tab: MainTab) {
        _state.update { it.copy(tab = tab) }
    }
}
