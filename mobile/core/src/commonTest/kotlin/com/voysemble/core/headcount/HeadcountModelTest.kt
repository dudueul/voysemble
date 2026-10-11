// Copyright 2026- At Day. All rights reserved.
// Facts: fixture opens 18/20 with two missing pinned; toggling marks present and flips to
// PENDING; close turns unmarked into MISSING, is final, and records closedWithMissing; marking
// after close is ignored; markSynced clears the pending flag.

package com.voysemble.core.headcount

import com.voysemble.core.fixtures.KoreaConcertTourFixture
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertSame
import kotlin.test.assertTrue

class HeadcountModelTest {
    private val hc = KoreaConcertTourFixture.headcountBusA()

    @Test
    fun fixture_opens_with_two_missing_and_synced() {
        assertEquals(20, hc.expected)
        assertEquals(18, hc.presentCount)
        assertEquals(listOf("Dohyun Kang", "Eunwoo Shin"), hc.missing.map { it.name })
        assertEquals(SyncState.SYNCED, hc.syncState)
        assertFalse(hc.isClosed)
    }

    @Test
    fun toggle_marks_present_then_unmarked_and_sets_pending() {
        val marked = hc.togglePresent("t7")
        assertEquals(HeadcountMark.PRESENT, marked.markOf("t7"))
        assertEquals(19, marked.presentCount)
        assertEquals(SyncState.PENDING, marked.syncState)
        assertEquals(listOf("Eunwoo Shin"), marked.missing.map { it.name })
        val unmarked = marked.togglePresent("t7")
        assertEquals(HeadcountMark.UNMARKED, unmarked.markOf("t7"))
    }

    @Test
    fun excused_and_with_other_group_count_as_accounted_not_missing() {
        val s = hc.mark("t7", HeadcountMark.EXCUSED).mark("t5", HeadcountMark.WITH_OTHER_GROUP)
        assertEquals(18, s.presentCount)
        assertEquals(20, s.accountedCount)
        assertEquals(emptyList(), s.missing)
    }

    @Test
    fun close_makes_unmarked_missing_is_final_and_pending_until_synced() {
        val closed = hc.close("06:58")
        assertTrue(closed.isClosed)
        assertTrue(closed.closedWithMissing)
        assertEquals(HeadcountMark.MISSING, closed.markOf("t7"))
        assertEquals(SyncState.PENDING, closed.syncState)
        assertSame(closed, closed.mark("t7", HeadcountMark.PRESENT))
        assertSame(closed, closed.close("07:00"))
        assertEquals(SyncState.SYNCED, closed.markSynced().syncState)
    }

    @Test
    fun explicit_missing_sorts_before_unmarked() {
        // t5 = Eunwoo Shin (unmarked), t7 = Dohyun Kang (explicitly missing), t3 newly unmarked.
        val s = hc.mark("t7", HeadcountMark.MISSING).mark("t3", HeadcountMark.UNMARKED)
        assertEquals(listOf("Dohyun Kang", "Eunwoo Shin", "Seojun Choi"), s.missing.map { it.name })
        assertEquals(HeadcountMark.MISSING, s.markOf(s.missing.first().id))
    }

    @Test
    fun unknown_member_is_ignored() {
        assertSame(hc, hc.mark("nobody", HeadcountMark.PRESENT))
    }
}
