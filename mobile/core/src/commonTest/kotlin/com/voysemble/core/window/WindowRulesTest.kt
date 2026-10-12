// Copyright 2026- At Day. All rights reserved.
// Facts: the judgement matches the server rule (inside within the radius at worst accuracy,
// outside beyond it at best, uncertain between or without a fix); haversine is right for a known
// pair; schematic offsets keep inside spots inside the disc and outside spots beyond it; the wire
// window maps to the screen model with local times and the viewer's id.

package com.voysemble.core.window

import com.voysemble.core.api.GeoPointDto
import com.voysemble.core.api.MeetingWindowDto
import com.voysemble.core.api.WindowCountsDto
import com.voysemble.core.api.WindowMemberDto
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class WindowRulesTest {
    @Test
    fun judgement_matches_the_server_rule() {
        assertEquals("inside", judgeWindowState(50.0, 20.0, 200))
        assertEquals("uncertain", judgeWindowState(190.0, 20.0, 200))
        assertEquals("outside", judgeWindowState(250.0, 20.0, 200))
        assertEquals("uncertain", judgeWindowState(null, 0.0, 200))
        val center = GeoPointDto(41.8902, 12.4922)
        assertEquals("inside", judgeWindowState(LocationFix(41.8903, 12.4923, 10.0), center.lat, center.lng, 200))
        assertEquals("outside", judgeWindowState(LocationFix(41.9000, 12.4922, 10.0), center.lat, center.lng, 200))
        assertEquals("uncertain", judgeWindowState(null, center.lat, center.lng, 200))
        assertEquals("uncertain", judgeWindowState(LocationFix(41.8903, 12.4923, 10.0), null, null, 200))
    }

    @Test
    fun haversine_for_a_known_pair() {
        // Colosseum to Roman Forum entrance: about 500 m.
        val d = haversineMeters(41.8902, 12.4922, 41.8925, 12.4853)
        assertTrue(abs(d - 625.0) < 60.0, "got $d")
        assertEquals(0.0, haversineMeters(1.0, 1.0, 1.0, 1.0))
    }

    @Test
    fun schematic_offsets_respect_the_disc() {
        for (i in 0 until 12) {
            val (ix, iy) = schematicOffset(WindowState.INSIDE, i)
            assertTrue(hypot(ix, iy) < 0.8f, "inside $i")
            val (ox, oy) = schematicOffset(WindowState.OUTSIDE, i)
            assertTrue(hypot(ox, oy) > 1.2f, "outside $i")
        }
        assertEquals(0f to 0f, schematicOffset(WindowState.OPTED_OUT, 3))
    }

    @Test
    fun wire_window_maps_to_the_screen_model() {
        val dto = MeetingWindowDto(
            id = "w1", tripId = "t", label = "Regroup", place = "Colosseum", radiusMeters = 200,
            startsAt = "2026-12-31T09:45:00.000Z", endsAt = "2026-12-31T10:20:00.000Z", groups = listOf("Bus A"),
            openedByName = "Kim", openedAt = "2026-12-31T09:40:00.000Z", status = "open", center = GeoPointDto(1.0, 2.0),
            members = listOf(WindowMemberDto("t1", "Minji Park", "Bus A", "opted_out"), WindowMemberDto("t2", "Juho Kim", "Bus A", "inside", "x")),
            counts = WindowCountsDto(1, 0, 0, 0, 1, 2),
        )
        val w = dto.toMeetingWindow("t1") { if (it.startsWith("2026-12-31T09")) "10:45" else "11:20" }
        assertEquals("10:45", w.startsAt)
        assertEquals("11:20", w.endsAt)
        assertEquals(WindowState.OPTED_OUT, w.me?.state)
        assertEquals(1, w.insideCount)
        assertEquals("Kim", w.openedBy)
        assertEquals("inside", WindowState.INSIDE.wireName())
        assertEquals("inside", wireNameOf(WindowState.INSIDE))
        assertEquals(WindowState.STALE, windowStateOf("stale"))
        // Swift-facing helpers: judge against the window's own point, pick the current window, the self row.
        assertEquals("inside", judgeWindowStateFor(LocationFix(1.0, 2.0, 10.0), dto))
        assertEquals("uncertain", judgeWindowStateFor(LocationFix(1.0, 2.0, 10.0), dto.copy(center = null)))
        assertEquals(WindowState.INSIDE, selfStateOf(dto, "t2"))
        assertEquals(WindowState.OUTSIDE, w.withSelfState(WindowState.OUTSIDE).me?.state)
        val staff = dto.toMeetingWindow("nobody") { it }
        assertEquals(null, staff.me)
        assertEquals(staff, staff.withSelfState(WindowState.OUTSIDE))
        assertEquals(null, selfStateOf(dto, "nobody"))
        val closed = dto.copy(id = "w0", status = "closed")
        val scheduled = dto.copy(id = "w2", status = "scheduled")
        assertEquals("w1", currentWindowOf(listOf(closed, dto, scheduled))?.id)
        assertEquals("w2", currentWindowOf(listOf(closed, scheduled))?.id)
        assertEquals(null, currentWindowOf(listOf(closed)))
    }
}
