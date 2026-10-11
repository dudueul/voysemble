// Copyright 2026- At Day. All rights reserved.
// Facts: window open/closed by local time; minutes left; opt-in moves the traveler to UNCERTAIN
// and opt-out back; counts per state; a leader device (no selfId) cannot opt in.

package com.voysemble.core.window

import com.voysemble.core.fixtures.KoreaConcertTourFixture
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertSame
import kotlin.test.assertTrue

class MeetingWindowModelTest {
    private val w = KoreaConcertTourFixture.meetingWindow()

    @Test
    fun open_between_start_and_end_with_minutes_left() {
        assertFalse(w.isOpenAt("10:44"))
        assertTrue(w.isOpenAt("10:45"))
        assertTrue(w.isOpenAt("11:19"))
        assertFalse(w.isOpenAt("11:20"))
        assertEquals(30, w.minutesLeftAt("10:50"))
        assertEquals(0, w.minutesLeftAt("11:25"))
    }

    @Test
    fun opt_in_and_out_change_only_self() {
        assertFalse(w.selfOptedIn)
        val on = w.optIn()
        assertTrue(on.selfOptedIn)
        assertEquals(WindowState.UNCERTAIN, on.self?.state)
        assertEquals(9, on.sharingCount)
        assertSame(on, on.optIn())
        val off = on.optOut()
        assertEquals(WindowState.OPTED_OUT, off.self?.state)
        assertEquals(w.members.filter { it.id != "t1" }, off.members.filter { it.id != "t1" })
    }

    @Test
    fun counts_per_state() {
        assertEquals(5, w.insideCount)
        assertEquals(1, w.count(WindowState.OUTSIDE))
        assertEquals(1, w.count(WindowState.STALE))
        assertEquals(1, w.count(WindowState.UNCERTAIN))
        assertEquals(8, w.sharingCount)
    }

    @Test
    fun leader_device_has_no_self_and_cannot_opt_in() {
        val leader = w.copy(selfId = null)
        assertSame(leader, leader.optIn())
        assertFalse(leader.selfOptedIn)
    }
}
