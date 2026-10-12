// Copyright 2026- At Day. All rights reserved.
// Facts (D41, slice 059): a hotel's rooming list decodes as the Worker sends it, null rooms included.

package com.voysemble.core.api

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class RoomingTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun decodes_the_list() {
        val list = json.decodeFromString<RoomingListDto>(
            """{"hotel":{"id":"h1","name":"Hotel de la Ville","city":"Rome","checkIn":"2026-12-28","checkOut":"2027-01-02","rooms":21},"people":[{"participationId":"p1","displayName":"Kim","role":"leader","groupName":"Bus A","room":"301"},{"participationId":"p2","displayName":"Lee, Hana","role":"traveler","groupName":"Bus B","room":null}],"roomsUsed":1,"assigned":1,"extra":true}""",
        )
        assertEquals("Hotel de la Ville", list.hotel.name)
        assertEquals(21, list.hotel.rooms)
        assertEquals("301", list.people[0].room)
        assertNull(list.people[1].room)
        assertEquals(1, list.assigned)
    }
}
