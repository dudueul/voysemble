// Copyright 2026- At Day. All rights reserved.
// Facts (D38, slice 048): the wire list becomes the phone's list and a guardian's says whose it
// is; a tick flips one item locally and the server's item replaces it; the summary counts in
// both languages; the fixture has six of nine packed.

package com.voysemble.core.packing

import com.voysemble.core.api.MyPackingItemDto
import com.voysemble.core.api.MyPackingListDto
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.i18n.AppLocale
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PackingModelTest {
    @AfterTest
    fun reset() {
        AppLocale.current = "en"
    }

    private val dto = MyPackingListDto(
        travelerParticipationId = "p-minji",
        travelerName = "Minji Park",
        packingFor = "guardian",
        items = listOf(
            MyPackingItemDto("a", "Passport + copy", "", packed = true, packedAt = "2026-12-20T09:00:00.000Z"),
            MyPackingItemDto("b", "EU plug adapter", "Type C or F", packed = false),
        ),
        packed = 1,
        total = 2,
    )

    @Test
    fun wire_to_list_ticks_and_summary() {
        val list = packingOf(dto)
        assertTrue(list.forTraveler)
        assertEquals("Packing for Minji Park", list.whose())
        assertEquals("1 of 2 packed", list.summary())
        assertFalse(list.allPacked())
        val ticked = list.withPacked("b", packed = true, at = "2026-12-23T00:00:00.000Z")
        assertEquals("All 2 packed", ticked.summary())
        assertEquals("2026-12-23T00:00:00.000Z", ticked.items[1].packedAt)
        val unticked = ticked.withPacked("a", packed = false, at = null)
        assertNull(unticked.items[0].packedAt)
        assertEquals(1, unticked.packedCount())
        val fromServer = unticked.replaceItem(PackingItem("a", "Passport + copy", "", packed = true, packedAt = "2026-12-24T00:00:00.000Z"))
        assertEquals(2, fromServer.packedCount())
        assertEquals("No items yet. The organizer adds them.", emptyPackingList().summary())
        assertTrue(emptyPackingList().withOffline(true).offline)
        assertEquals("Your packing list", packingOf(dto.copy(packingFor = "self")).whose())
    }

    @Test
    fun fixture_and_korean() {
        val fixture = KoreaConcertTourFixture.packing()
        assertEquals(9, fixture.items.size)
        assertEquals("6 of 9 packed", fixture.summary())
        AppLocale.current = "ko"
        assertEquals("9개 중 6개 챙김", fixture.summary())
        assertEquals("내 준비물 목록", fixture.whose())
        assertEquals("Minji Park의 준비물", packingOf(dto).whose())
    }
}
