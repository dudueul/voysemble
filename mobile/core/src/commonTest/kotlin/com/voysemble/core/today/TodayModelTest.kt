// Copyright 2026- At Day. All rights reserved.
// Facts: up-next picks the first unfinished event at or after now; later excludes it; ack goes
// UNACKNOWLEDGED -> PENDING -> ACKNOWLEDGED only in that order; head count sums.

package com.voysemble.core.today

import com.voysemble.core.fixtures.KoreaConcertTourFixture
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame

class TodayModelTest {
    private val snap = KoreaConcertTourFixture.today()

    @Test
    fun up_next_is_breakfast_at_0712_and_later_list_starts_after_it() {
        assertEquals("ev_1", snap.upNext?.id)
        assertEquals(listOf("ev_2", "ev_3", "ev_4", "ev_5", "ev_6", "ev_7", "ev_8"), snap.later.map { it.id })
    }

    @Test
    fun up_next_skips_done_and_cancelled_and_moves_with_now() {
        val at0900 = snap.copy(now = "09:00", events = snap.events.map { if (it.id in setOf("ev_1", "ev_2", "ev_3")) it.copy(status = EventStatus.DONE) else it })
        assertEquals("ev_4", at0900.upNext?.id)
        val lateNight = snap.copy(now = "23:30")
        assertEquals(null, lateNight.upNext)
        assertEquals(emptyList(), lateNight.later)
    }

    @Test
    fun in_progress_event_that_has_not_ended_is_still_up_next() {
        val at0800 = snap.copy(now = "08:00", events = snap.events.map { if (it.id == "ev_1") it.copy(status = EventStatus.IN_PROGRESS) else it })
        assertEquals("ev_1", at0800.upNext?.id)
    }

    @Test
    fun acknowledgment_transitions_are_ordered_and_idempotent() {
        val pending = snap.acknowledgeAnnouncement("an_departure")
        assertEquals(AckState.PENDING, pending.announcement?.ack)
        assertEquals(32, pending.announcement?.acknowledgedCount)
        assertSame(pending, pending.acknowledgeAnnouncement("an_departure"))
        assertSame(snap, snap.confirmAcknowledgment("an_departure"))
        val confirmed = pending.confirmAcknowledgment("an_departure")
        assertEquals(AckState.ACKNOWLEDGED, confirmed.announcement?.ack)
        assertEquals(33, confirmed.announcement?.acknowledgedCount)
        assertSame(snap, snap.acknowledgeAnnouncement("other"))
    }

    @Test
    fun headcount_totals() {
        assertEquals(34, snap.checkedIn)
        assertEquals(38, snap.expected)
    }
}
