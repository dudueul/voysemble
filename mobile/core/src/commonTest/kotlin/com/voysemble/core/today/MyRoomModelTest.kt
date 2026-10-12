// Copyright 2026- At Day. All rights reserved.
// Facts (slice 075): the stay maps to the card with the room and the roommates; no room yet keeps
// the hotel; outside any stay there is no card.

package com.voysemble.core.today

import com.voysemble.core.api.MyRoomDto
import com.voysemble.core.api.MyRoomStayDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class MyRoomModelTest {
    @Test
    fun the_stay_maps_to_the_card() {
        val stay = MyRoomStayDto("Hotel de la Ville", "Rome", "2026-12-28", "2027-01-02", "412", listOf("Juho Kim"))
        assertEquals(MyRoomCard("Hotel de la Ville", "412", listOf("Juho Kim"), "2027-01-02"), myRoomCardOf(MyRoomDto(stay)))
        assertEquals(MyRoomCard("Hotel de la Ville", null, emptyList(), "2027-01-02"), myRoomCardOf(MyRoomDto(stay.copy(room = null, roommates = emptyList()))))
    }

    @Test
    fun outside_a_stay_there_is_no_card() {
        assertNull(myRoomCardOf(MyRoomDto(null)))
        assertNull(myRoomCardOf(MyRoomDto()))
    }
}
