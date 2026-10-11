// Copyright 2026- At Day. All rights reserved.
// Facts: epoch-day arithmetic and labels match known dates; the snapshot takes only the given
// date's events in order, maps kinds and statuses, numbers the day from the trip start, and the
// up-next rule works on the result.

package com.voysemble.core.today

import com.voysemble.core.api.ItineraryDayDto
import com.voysemble.core.api.ItineraryDto
import com.voysemble.core.api.ItineraryEventDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TodayBuilderTest {
    private fun ev(id: String, date: String, start: String, order: Int, kind: String = "activity", status: String = "scheduled", end: String? = null) =
        ItineraryEventDto(id, "t", date, start, end, "Europe/Rome", kind, "Event $id", "Place", null, status, null, order, true)

    private val itinerary = ItineraryDto(
        tripId = "t", tripName = "Korea Concert Tour", startDate = "2026-12-28", endDate = "2027-01-09", revision = 3,
        publishedAt = "2026-12-20T00:00:00.000Z", view = "published",
        days = listOf(ItineraryDayDto("2026-12-28", "Asia/Seoul", "Day 1"), ItineraryDayDto("2026-12-31", "Europe/Rome", "Day 4")),
        events = listOf(
            ev("b", "2026-12-31", "07:30", 2, "meeting"),
            ev("a", "2026-12-31", "07:30", 1, "meal", "done", "08:15"),
            ev("c", "2026-12-31", "09:00", 3, "activity", "scheduled", "11:00"),
            ev("x", "2027-01-01", "10:00", 1),
        ),
        unpublished = 0,
    )

    @Test
    fun dates_and_labels() {
        assertEquals(0L, epochDayOf("1970-01-01"))
        assertEquals(20818L, epochDayOf("2026-12-31")) // 57 years, 14 leap days, minus the last day
        assertEquals("Thursday, Dec 31", dateLabelOf("2026-12-31"))
        assertEquals("Monday, Dec 28", dateLabelOf("2026-12-28"))
        assertEquals("Friday, Jan 1", dateLabelOf("2027-01-01"))
        assertEquals("Rome", zoneLabelOf("Europe/Rome"))
        assertEquals("New York", zoneLabelOf("America/New_York"))
    }

    @Test
    fun snapshot_for_a_day() {
        val s = todaySnapshotOf(itinerary, "2026-12-31", "07:12", minutesSinceSync = 2)
        assertEquals(4, s.dayNumber)
        assertEquals("Thursday, Dec 31", s.dateLabel)
        assertEquals("Rome", s.timeZoneLabel)
        assertEquals(listOf("a", "b", "c"), s.events.map { it.id })
        assertEquals(EventKind.MEETING, s.events[1].kind)
        assertEquals(true, s.events[1].isMeetingPoint)
        assertEquals(EventStatus.DONE, s.events[0].status)
        assertEquals("b", s.upNext?.id) // "a" is done; "b" at 07:30 is next
        assertEquals(listOf("c"), s.later.map { it.id })
        assertNull(s.announcement)
        assertEquals(2, s.minutesSinceSync)
        val empty = todaySnapshotOf(itinerary, "2026-12-27", "09:00")
        assertEquals(0, empty.dayNumber)
        assertEquals(emptyList(), empty.events)
    }
}
