// Copyright 2026- At Day. All rights reserved.
// Facts: the oldest unacknowledged required-ack announcement rides on Today, the latest one once
// everything is acknowledged, none when nothing requires an ack; the card maps counts, author,
// local time and ack state; the empty snapshot invents nothing but the trip name.

package com.voysemble.core.today

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
}
