// Copyright 2026- At Day. All rights reserved.
// Facts (D37, slice 047): the travel plan decodes as the Worker sends it to a leader (the bus
// carries driverContact null) and to an organizer (a string); unknown keys are ignored.

package com.voysemble.core.api

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TravelTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun decodes_the_plan_for_a_leader_and_for_an_organizer() {
        val leader = json.decodeFromString<TravelPlanDto>(
            """{"flights":[{"id":"f","tripId":"t","kind":"flight","code":"DEMO 901","from":"ICN","to":"FCO","departsAt":"2026-12-28T13:30","arrivesAt":"2026-12-28T18:55","pax":42,"pnr":"VYS8K2","status":"scheduled","createdAt":"2026-10-12T00:00:00.000Z"}],
               "hotels":[{"id":"h","tripId":"t","kind":"hotel","name":"Hotel de la Ville","city":"Rome","checkIn":"2026-12-28","checkOut":"2027-01-02","rooms":21,"confirmation":"","nights":5,"createdAt":"2026-10-12T00:00:00.000Z"}],
               "buses":[{"id":"b","tripId":"t","kind":"bus","label":"Bus A","company":"Roma Coach","seats":24,"driverContact":null,"groups":["Bus A"],"assigned":2,"createdAt":"2026-10-12T00:00:00.000Z","extra":1}],
               "groups":["Bus A","Bus B"],"travelers":3}""",
        )
        assertEquals("DEMO 901", leader.flights.single().code)
        assertEquals(5, leader.hotels.single().nights)
        assertNull(leader.buses.single().driverContact)
        assertEquals(2, leader.buses.single().assigned)
        val organizer = json.decodeFromString<BusDto>(
            """{"id":"b","tripId":"t","kind":"bus","label":"Bus A","company":"Roma Coach","seats":24,"driverContact":"+39 06 000 0000","groups":[],"assigned":0,"createdAt":"2026-10-12T00:00:00.000Z"}""",
        )
        assertEquals("+39 06 000 0000", organizer.driverContact)
    }
}
