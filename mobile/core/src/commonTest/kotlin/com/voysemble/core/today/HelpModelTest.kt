// Copyright 2026- At Day. All rights reserved.
// Facts (slice 074): the traveler's card is the first server card naming them (open first), with
// local times; nothing naming them is null; the request carries their words or the default
// title, trimmed, and themselves alone.

package com.voysemble.core.today

import com.voysemble.core.api.IncidentDto
import com.voysemble.core.api.IncidentPersonDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class HelpModelTest {
    private val clock: (String) -> String = { iso -> iso.substring(11, 16) }
    private fun card(id: String, status: String, title: String, who: String, resolvedAt: String? = null) = IncidentDto(
        id = id, tripId = "trip_1", kind = "help", status = status, title = title,
        people = listOf(IncidentPersonDto(who, "Minji Park", "Bus A")),
        openedAt = "2026-12-31T06:12:00.000Z", openedByName = "Minji Park", resolvedAt = resolvedAt,
    )

    @Test
    fun the_first_card_naming_me_with_local_times() {
        val open = helpCardOf(listOf(card("i2", "open", "I feel sick", "p1"), card("i1", "resolved", "Lost", "p1", "2026-12-31T07:40:00.000Z")), "p1", clock)
        assertEquals(HelpCard("i2", "I feel sick", HelpStatus.OPEN, "06:12", null), open)
        val resolved = helpCardOf(listOf(card("i1", "resolved", "Lost", "p1", "2026-12-31T07:40:00.000Z")), "p1", clock)
        assertEquals(HelpCard("i1", "Lost", HelpStatus.RESOLVED, "06:12", "07:40"), resolved)
    }

    @Test
    fun the_latest_answer_names_the_leader_and_the_time() {
        // Slice 082: the server lists the latest answer first, its note blanked.
        val answer = com.voysemble.core.api.IncidentConfirmationDto("c1", "with_group", null, "Kim Daeun", "leader", "2026-12-31T06:20:00.000Z")
        val answered = helpCardOf(listOf(card("i2", "open", "I feel sick", "p1").copy(confirmations = listOf(answer))), "p1", clock)
        assertEquals("Kim Daeun", answered?.answeredBy)
        assertEquals("06:20", answered?.answeredAt)
        assertNull(helpCardOf(listOf(card("i2", "open", "I feel sick", "p1")), "p1", clock)?.answeredBy)
    }

    @Test
    fun nothing_naming_me_is_null() {
        assertNull(helpCardOf(listOf(card("i2", "open", "x", "p9")), "p1", clock))
        assertNull(helpCardOf(emptyList(), "p1", clock))
    }

    @Test
    fun the_request_carries_my_words_or_the_default_and_me_alone() {
        assertEquals(listOf("p1"), helpRequestOf("  I feel sick ", "p1", "Asked for help").participationIds)
        assertEquals("I feel sick", helpRequestOf("  I feel sick ", "p1", "Asked for help").title)
        assertEquals("Asked for help", helpRequestOf("   ", "p1", "Asked for help").title)
        assertEquals(160, helpRequestOf("x".repeat(400), "p1", "Asked for help").title.length)
    }
}
