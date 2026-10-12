// Copyright 2026- At Day. All rights reserved.
// Facts (slice 035): the plan lists every itinerary day in date order with the organizer's label
// (or "Day n"), the day's events in the organizer's order with the Today mapping, the next add
// slot after the last event, the revision line; the first day to open is the device date when
// it is a trip day, otherwise the nearest edge; the fixture plan ends on the Today fixture's day.

package com.voysemble.core.plan

import com.voysemble.core.api.ItineraryDayDto
import com.voysemble.core.api.ItineraryDto
import com.voysemble.core.api.ItineraryEventDto
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.today.EventKind
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PlanModelTest {
    private fun ev(id: String, date: String, start: String, order: Int, kind: String = "activity") =
        ItineraryEventDto(id, "t", date, start, null, "Europe/Rome", kind, "Event $id", "Place", null, "scheduled", null, order, true)

    private val itinerary = ItineraryDto(
        tripId = "t", tripName = "Korea Concert Tour", startDate = "2026-12-28", endDate = "2026-12-31", revision = 3,
        publishedAt = "2026-12-20T09:00:00.000Z", view = "published",
        days = listOf(
            ItineraryDayDto("2026-12-31", "Europe/Rome", "Concert day"),
            ItineraryDayDto("2026-12-28", "Europe/Rome", ""),
            ItineraryDayDto("2026-12-30", "Europe/Rome", "Free day"),
        ),
        events = listOf(ev("b", "2026-12-31", "07:30", 2, "meeting"), ev("a", "2026-12-31", "07:30", 1, "meal"), ev("x", "2026-12-28", "10:00", 5)),
        unpublished = 0,
    )

    @Test
    fun plan_lists_days_in_order_with_labels_events_and_next_slot() {
        val plan = planOf(itinerary)
        assertEquals(listOf("2026-12-28", "2026-12-30", "2026-12-31"), plan.days.map { it.date })
        assertEquals(listOf("Day 1", "Free day", "Concert day"), plan.days.map { it.label })
        assertEquals(listOf(1, 3, 4), plan.days.map { it.dayNumber })
        assertEquals("Monday, Dec 28", plan.days[0].dateLabel)
        assertEquals("Rome", plan.days[0].timeZoneLabel)
        val last = plan.days[2]
        assertEquals(listOf("a", "b"), last.events.map { it.id })
        assertEquals(EventKind.MEETING, last.events[1].kind)
        assertTrue(last.events[1].isMeetingPoint)
        assertEquals(3, last.nextOrder)
        assertEquals(6, plan.days[0].nextOrder)
        assertEquals(0, plan.days[1].nextOrder)
        assertEquals("Revision 3 · published 2026-12-20", plan.revisionLine())
        assertEquals("Not published yet", emptyTripPlan("x").revisionLine())
        assertNull(emptyTripPlan("x").minutesSinceSync)
        assertTrue(plan.withOffline(true).offline)
    }

    @Test
    fun initial_day_is_today_inside_the_trip_and_the_nearest_edge_outside() {
        val plan = planOf(itinerary)
        assertEquals(2, plan.initialDayIndex("2026-12-31"))
        assertEquals(0, plan.initialDayIndex("2026-12-01"))
        assertEquals(2, plan.initialDayIndex("2027-01-05"))
        // Dec 29 has no day row: the last day before it.
        assertEquals(0, plan.initialDayIndex("2026-12-29"))
        assertEquals(0, emptyTripPlan("x").initialDayIndex("2026-12-31"))
    }

    @Test
    fun fixture_plan_ends_on_the_today_fixture() {
        val plan = KoreaConcertTourFixture.plan()
        assertEquals(4, plan.days.size)
        assertEquals(KoreaConcertTourFixture.today().events, plan.days.last().events)
        assertEquals(3, plan.initialDayIndex("2026-12-31"))
    }
}
