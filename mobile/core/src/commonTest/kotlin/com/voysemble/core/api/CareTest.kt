// Copyright 2026- At Day. All rights reserved.
// Facts (D27, slice 030): the care line joins only the parts that are set; a roster row without
// the flag decodes as false and the head count member carries it; the fixture has one note.

package com.voysemble.core.api

import com.voysemble.core.fixtures.KoreaConcertTourFixture
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CareTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun care_line_joins_only_the_parts_that_are_set() {
        assertEquals("Allergies: Peanuts · Medications: EpiPen in the red bag · Asks for it herself.", careLineOf(KoreaConcertTourFixture.careNote()))
        assertEquals("Medications: Inhaler", careLineOf(CareNoteDto(allergies = " ", medications = "Inhaler")))
        assertEquals("", careLineOf(CareNoteDto()))
    }

    @Test
    fun roster_flag_decodes_and_reaches_the_head_count_member() {
        val wire = """{"participations":[
            {"id":"p1","tripId":"t","role":"traveler","displayName":"Minji Park","groupName":"Bus A","guardianOf":null,"accountId":null,"createdAt":"2026-10-11T00:00:00.000Z","hasCareNote":true},
            {"id":"p2","tripId":"t","role":"traveler","displayName":"Juho Kim","groupName":"Bus A","guardianOf":null,"accountId":null,"createdAt":"2026-10-11T00:00:00.000Z"}
        ]}"""
        val roster = json.decodeFromString<RosterResponseDto>(wire)
        assertTrue(roster.participations[0].hasCareNote)
        assertTrue(!roster.participations[1].hasCareNote)
        val session = headcountFromRoster("h", roster.participations, "Bus A", "Kim", "06:50")
        assertEquals(listOf(false, true), session.members.map { it.hasCareNote })
        assertTrue(KoreaConcertTourFixture.headcountBusA().members.first { it.name == "Minji Park" }.hasCareNote)
    }

    @Test
    fun reveal_response_decodes() {
        val r = json.decodeFromString<RevealCareNoteResponseDto>(
            """{"participationId":"p1","note":{"allergies":"Peanuts","medications":"","freeText":""},"updatedAt":"2026-10-12T04:00:00.000Z","updatedByName":"Sora Park","revealedAt":"2026-10-12T04:05:00.000Z"}""",
        )
        assertEquals("Allergies: Peanuts", careLineOf(r.note))
        assertEquals("Sora Park", r.updatedByName)
    }
}
