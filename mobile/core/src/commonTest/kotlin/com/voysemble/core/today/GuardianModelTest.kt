// Copyright 2026- At Day. All rights reserved.
// Facts: the guardian card reads present / with another group / excused with the where-line,
// missing with an attention tone, the leaders' message once sent (good when resolved), and
// "not counted yet" before any count; Korean copy follows the locale.

package com.voysemble.core.today

import com.voysemble.core.api.GuardianCountDto
import com.voysemble.core.api.GuardianIncidentDto
import com.voysemble.core.api.GuardianMessageDto
import com.voysemble.core.api.GuardianStatusDto
import com.voysemble.core.api.GuardianTravelerDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class GuardianModelTest {
    private val minji = GuardianTravelerDto("p1", "Minji Park", "Bus A")
    private fun status(count: GuardianCountDto, incident: GuardianIncidentDto? = null) = GuardianStatusDto(minji, count, incident, 7)
    private val present = GuardianCountDto("present", "hc1", "Bus A", closed = false, atDevice = "06:52", byName = "Kim Daeun", receivedAt = "x")

    @Test
    fun present_with_the_where_line_in_both_languages() {
        val en = guardianCardOf(status(present))
        assertEquals("Counted present", en.headline)
        assertEquals("Bus A · 06:52 · by Kim Daeun", en.detail)
        assertEquals(GuardianTone.GOOD, en.tone)
        assertNull(en.message)
        val ko = guardianCardOf(status(present), "ko")
        assertEquals("출석 확인됨", ko.headline)
        assertEquals("Bus A · 06:52 · Kim Daeun 인솔자", ko.detail)
    }

    @Test
    fun missing_is_attention_until_the_message_arrives() {
        val closed = present.copy(status = "missing", closed = true, atDevice = "06:55")
        val open = GuardianIncidentDto("inc1", "open", "2026-12-31T05:56:00.000Z")
        val card = guardianCardOf(status(closed, open))
        assertEquals("Missing at the 06:55 count", card.headline)
        assertEquals(GuardianTone.ATTENTION, card.tone)
        assertNull(card.message)
        val sent = open.copy(status = "resolved", message = GuardianMessageDto("Minji Park is with the group.", "Minji Park 학생은 그룹과 함께 있습니다.", "2026-12-31T06:10:00.000Z", "Organizer"))
        val en = guardianCardOf(status(closed, sent), clock = { "06:56" })
        assertEquals("Update from the leaders", en.headline)
        assertEquals("Opened at 06:56", en.detail)
        assertEquals("Minji Park is with the group.", en.message)
        assertEquals(GuardianTone.GOOD, en.tone)
        assertEquals("Minji Park 학생은 그룹과 함께 있습니다.", guardianCardOf(status(closed, sent), "ko").message)
    }

    @Test
    fun not_counted_before_any_count_and_other_marks() {
        val none = guardianCardOf(status(GuardianCountDto("not_counted", closed = false)))
        assertEquals("Not counted yet today", none.headline)
        assertEquals("The leader has not opened a head count for Bus A yet.", none.detail)
        assertEquals(GuardianTone.CALM, none.tone)
        assertEquals("With another group", guardianCardOf(status(present.copy(status = "with_other_group"))).headline)
        assertEquals("Excused", guardianCardOf(status(present.copy(status = "excused"))).headline)
        assertEquals("아직 인원 점검 전입니다", guardianCardOf(status(GuardianCountDto("not_counted", closed = false)), "ko").headline)
    }
}
