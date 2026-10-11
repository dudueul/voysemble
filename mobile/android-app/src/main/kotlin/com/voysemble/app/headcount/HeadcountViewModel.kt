// Copyright 2026- At Day. All rights reserved.
// Head count state holder. Owns: the HeadcountSession (core), the device clock string used on
// close. Must not: compute rules (core does) or talk to the network (sync slice later).

package com.voysemble.app.headcount

import androidx.lifecycle.ViewModel
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.headcount.HeadcountMark
import com.voysemble.core.headcount.HeadcountSession
import com.voysemble.core.headcount.close
import com.voysemble.core.headcount.mark
import com.voysemble.core.headcount.togglePresent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

class HeadcountViewModel(
    initial: HeadcountSession = KoreaConcertTourFixture.headcountBusA(),
    /** Injected so tests and screenshots are deterministic. */
    private val deviceClock: () -> String = { "06:58" },
) : ViewModel() {
    private val _state = MutableStateFlow(initial)
    val state: StateFlow<HeadcountSession> = _state

    fun togglePresent(memberId: String) = _state.update { it.togglePresent(memberId) }
    fun excuse(memberId: String) = _state.update { it.mark(memberId, HeadcountMark.EXCUSED) }
    fun withOtherGroup(memberId: String) = _state.update { it.mark(memberId, HeadcountMark.WITH_OTHER_GROUP) }
    fun close() = _state.update { it.close(deviceClock()) }
}
