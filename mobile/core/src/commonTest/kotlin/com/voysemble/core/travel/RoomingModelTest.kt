// Copyright 2026- At Day. All rights reserved.
// Facts (D41, slice 059): the wire list becomes the phone's; the rooms come in label order with
// numbers compared as numbers; the unassigned are listed by name; the summary counts in both
// languages; the fixture has three rooms and one person unplaced.

package com.voysemble.core.travel

import com.voysemble.core.api.RoomAssignmentDto
import com.voysemble.core.api.RoomingHotelDto
import com.voysemble.core.api.RoomingListDto
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.i18n.AppLocale
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class RoomingModelTest {
    @AfterTest
    fun reset() {
        AppLocale.current = "en"
    }

    private val dto = RoomingListDto(
        hotel = RoomingHotelDto("h1", "Hotel de la Ville", "Rome", "2026-12-28", "2027-01-02", rooms = 21),
        people = listOf(
            RoomAssignmentDto("p1", "Kim", "leader", "Bus A", room = "1001"),
            RoomAssignmentDto("p2", "Juho Kim", "traveler", "Bus A", room = "204"),
            RoomAssignmentDto("p3", "Minji Park", "traveler", "Bus A", room = "204"),
            RoomAssignmentDto("p4", "Lee, Hana", "traveler", "Bus B", room = null),
        ),
        roomsUsed = 2,
        assigned = 3,
    )

    @Test
    fun wire_to_rooms_and_summary() {
        val r = roomingOf(dto)
        assertEquals("Hotel de la Ville", r.hotelName)
        assertEquals(listOf("204" to listOf("Juho Kim", "Minji Park"), "1001" to listOf("Kim")), r.byRoom().map { it.room to it.names })
        assertEquals(listOf("Lee, Hana"), r.unassigned())
        assertEquals(3, r.assignedCount())
        assertEquals(2, r.roomsUsed())
        assertEquals("3 of 4 placed · 2 of 21 rooms used", r.summary())
        assertEquals("Room 204", roomLabel("204"))
        assertEquals("Minji Park, room 204", r.people[2].spoken())
        assertEquals("Lee, Hana, no room yet", r.people[3].spoken())
        assertTrue(emptyRooming("x").byRoom().isEmpty())
        assertTrue(emptyRooming("x").withOffline(true).offline)
    }

    @Test
    fun fixture_and_korean() {
        val fixture = KoreaConcertTourFixture.rooming()
        assertEquals(listOf("412", "415", "501"), fixture.byRoom().map { it.room })
        assertEquals(listOf("Lee Hana"), fixture.unassigned())
        assertEquals("4 of 5 placed · 3 of 21 rooms used", fixture.summary())
        AppLocale.current = "ko"
        assertEquals("5명 중 4명 배정 · 21실 중 3실 사용", fixture.summary())
        assertEquals("204호", roomLabel("204"))
        assertEquals("Lee Hana, 아직 객실 없음", fixture.people[4].spoken())
    }
}
