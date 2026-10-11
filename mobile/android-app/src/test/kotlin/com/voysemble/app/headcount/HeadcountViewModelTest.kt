// Copyright 2026- At Day. All rights reserved.
// Facts: toggling marks present and flips to pending sync; closing uses the injected device clock,
// marks the rest missing, and is final.

package com.voysemble.app.headcount

import com.voysemble.core.headcount.HeadcountMark
import com.voysemble.core.headcount.SyncState
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.Test

class HeadcountViewModelTest {
    @Test
    fun toggle_then_close_with_device_clock() {
        val vm = HeadcountViewModel(deviceClock = { "06:58" })
        vm.togglePresent("t7")
        assertEquals(19, vm.state.value.presentCount)
        assertEquals(SyncState.PENDING, vm.state.value.syncState)
        vm.excuse("t5")
        vm.close()
        assertEquals("06:58", vm.state.value.closedAtDevice)
        assertEquals(HeadcountMark.EXCUSED, vm.state.value.markOf("t5"))
        assertTrue(vm.state.value.isClosed)
        vm.togglePresent("t1")
        assertEquals(HeadcountMark.PRESENT, vm.state.value.markOf("t1"))
    }
}
