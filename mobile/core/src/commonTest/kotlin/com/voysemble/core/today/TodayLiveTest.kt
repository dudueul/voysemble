// Copyright 2026- At Day. All rights reserved.
// Facts: the oldest unacknowledged required-ack announcement rides on Today, the latest one once
// everything is acknowledged, none when nothing requires an ack; the card maps counts, author,
// local time and ack state; the empty snapshot invents nothing but the trip name.

package com.voysemble.core.today

import com.voysemble.core.api.HeadcountSessionDto
import com.voysemble.core.api.AnnouncementDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TodayLiveTest {
    private fun dto(id: String, at: String, requiresAck: Boolean = true, myAck: String = "unacknowledged") = AnnouncementDto(
        id = id, tripId = "t", title = "T $id", body = "B", requiresAck = requiresAck, sharedWithGuardians = false,
        authorName = "Organizer", publishedAt = at, ackTotal = 38, ackCount = 32, myAck = myAck,
    )

    @Test
    fun oldest_unacknowledged_first_then_latest_then_none() {
        val older = dto("r1", "2026-12-30T22:00:00.000Z")
        val newer = dto("r2", "2026-12-31T06:30:00.000Z")
        assertEquals("r1", latestRequiredAck(listOf(newer, older))?.id)
        assertEquals("r2", latestRequiredAck(listOf(older.copy(myAck = "acknowledged"), newer))?.id)
        val allAcked = listOf(older.copy(myAck = "acknowledged"), newer.copy(myAck = "acknowledged"))
        assertEquals("r2", latestRequiredAck(allAcked)?.id)
        assertNull(latestRequiredAck(listOf(dto("fyi", "2026-12-31T07:00:00.000Z", requiresAck = false))))
        assertNull(latestRequiredAck(emptyList()))
    }

    @Test
    fun card_maps_counts_author_time_and_ack_state() {
        val card = dto("r2", "2026-12-31T06:30:00.000Z").toTodayAnnouncement { "06:30" }
        assertEquals(TodayAnnouncement("r2", "T r2", "B", "Organizer", "06:30", 32, 38, AckState.UNACKNOWLEDGED), card)
        assertEquals(AckState.ACKNOWLEDGED, dto("r2", "x", myAck = "acknowledged").toTodayAnnouncement { it }.ack)
    }

    @Test
    fun snapshot_helpers_and_empty_snapshot() {
        val empty = emptyTodaySnapshot("")
        assertEquals("Your trip", empty.tripName)
        assertEquals(0, empty.dayNumber)
        assertNull(empty.minutesSinceSync)
        val card = dto("r2", "x").toTodayAnnouncement { it }
        assertEquals(card, emptyTodaySnapshot("Tour").withAnnouncement(card).announcement)
        assertEquals(true, empty.withOffline(true).offline)
    }

    private fun session(id: String, group: String?, at: String, accounted: Int, expected: Int) = HeadcountSessionDto(
        id = id, tripId = "t", groupName = group, openedByName = "Kim", openedAtDevice = "06:50", receivedAt = at,
        expected = expected, present = accounted, accounted = accounted, missing = emptyList(), closedWithMissing = false,
    )

    @Test
    fun todays_newest_session_per_group_in_label_order() {
        // Slice 086: yesterday's count is ignored; the newer Bus A count wins; a whole-trip count has its own label.
        val sessions = listOf(
            session("a1", "Bus A", "2026-12-31T05:50:00.000Z", 18, 20),
            session("a2", "Bus A", "2026-12-31T06:40:00.000Z", 20, 20),
            session("b1", "Bus B", "2026-12-31T05:55:00.000Z", 16, 18),
            session("w1", null, "2026-12-31T07:00:00.000Z", 36, 38),
            session("old", "Bus C", "2026-12-30T05:00:00.000Z", 3, 9),
        )
        val groups = headcountGroupsOf(sessions, today = "2026-12-31", dateOf = { it.take(10) }, wholeTrip = "Whole trip")
        assertEquals(
            listOf(HeadcountGroup("Bus A", 20, 20), HeadcountGroup("Bus B", 16, 18), HeadcountGroup("Whole trip", 36, 38)),
            groups,
        )
        assertEquals(emptyList(), headcountGroupsOf(emptyList(), today = "2026-12-31", dateOf = { it }, wholeTrip = "Whole trip"))
        val snap = emptyTodaySnapshot("Trip").withHeadcount(groups)
        assertEquals(72, snap.checkedIn)
        assertEquals(76, snap.expected)
    }
}
