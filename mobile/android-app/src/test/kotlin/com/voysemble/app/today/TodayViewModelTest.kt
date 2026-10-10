// Copyright 2026- At Day. All rights reserved.
// Facts: acknowledging moves the announcement to PENDING once; tab selection is reflected.

package com.voysemble.app.today

import com.voysemble.core.today.AckState
import kotlin.test.Test
import kotlin.test.assertEquals

class TodayViewModelTest {
    @Test
    fun acknowledge_queues_once() {
        val vm = TodayViewModel()
        vm.acknowledge("an_departure")
        vm.acknowledge("an_departure")
        assertEquals(AckState.PENDING, vm.state.value.snapshot.announcement?.ack)
        assertEquals(32, vm.state.value.snapshot.announcement?.acknowledgedCount)
    }

    @Test
    fun select_tab() {
        val vm = TodayViewModel()
        vm.selectTab(MainTab.PLAN)
        assertEquals(MainTab.PLAN, vm.state.value.tab)
    }
}
