// Copyright 2026- At Day. All rights reserved.
//
// The Plan tab (slice 035): the whole published itinerary, one day at a time, on both phones.
// Pure Kotlin over the itinerary wire type; the same day labels, numbers and event mapping as
// Today (today/TodayBuilder.kt) so the two tabs never disagree. The phone reads only (D24):
// leaders propose changes from here, the organizer decides on the console.

package com.voysemble.core.plan

import com.voysemble.core.api.ItineraryDto
import com.voysemble.core.today.TodayEvent
import com.voysemble.core.today.dateLabelOf
import com.voysemble.core.today.epochDayOf
import com.voysemble.core.today.toTodayEvent
import com.voysemble.core.today.zoneLabelOf

/** One day of the plan. `nextOrder` is where an added event would land (after the last one). */
public data class PlanDay(
    val date: String,
    /** The organizer's label ("Day 4", "Rome arrival"); the day number when blank. */
    val label: String,
    /** "Thursday, Dec 31". */
    val dateLabel: String,
    val timeZone: String,
    val timeZoneLabel: String,
    val dayNumber: Int,
    val events: List<TodayEvent>,
    val nextOrder: Int,
)

public data class TripPlan(
    val tripName: String,
    val revision: Int,
    /** ISO instant of the published revision; null before the first publish. */
    val publishedAt: String?,
    val days: List<PlanDay>,
    val offline: Boolean = false,
    val minutesSinceSync: Int? = 0,
)

/** The plan from the published itinerary: every trip day, its events in the organizer's order. */
public fun planOf(itinerary: ItineraryDto, offline: Boolean = false, minutesSinceSync: Int? = 0): TripPlan {
    val start = epochDayOf(itinerary.startDate)
    val days = itinerary.days.sortedBy { it.date }.map { day ->
        val rows = itinerary.events.filter { it.date == day.date }.sortedWith(compareBy({ it.order }, { it.start }))
        val number = (epochDayOf(day.date) - start + 1).toInt()
        PlanDay(
            date = day.date,
            label = day.label.ifBlank { "Day $number" },
            dateLabel = dateLabelOf(day.date),
            timeZone = day.timeZone,
            timeZoneLabel = zoneLabelOf(day.timeZone),
            dayNumber = number,
            events = rows.map { it.toTodayEvent() },
            nextOrder = (rows.maxOfOrNull { it.order } ?: -1) + 1,
        )
    }
    return TripPlan(itinerary.tripName, itinerary.revision, itinerary.publishedAt, days, offline, minutesSinceSync)
}

/** Shown until the first itinerary answer: the trip name, no days invented. */
public fun emptyTripPlan(tripName: String): TripPlan = TripPlan(tripName, 0, null, emptyList(), offline = false, minutesSinceSync = null)

/** Named copy so Swift does not have to spell every field. */
public fun TripPlan.withOffline(offline: Boolean): TripPlan = copy(offline = offline)

/**
 * Which day opens first: the device date when it is a trip day, the first day before the trip,
 * the last day after it; 0 on an empty plan.
 */
public fun TripPlan.initialDayIndex(date: String): Int {
    if (days.isEmpty()) return 0
    val exact = days.indexOfFirst { it.date == date }
    if (exact >= 0) return exact
    val today = epochDayOf(date)
    if (today < epochDayOf(days.first().date)) return 0
    if (today > epochDayOf(days.last().date)) return days.lastIndex
    // A gap inside the trip (no day row for the date): the last day before it.
    return days.indexOfLast { epochDayOf(it.date) < today }.coerceAtLeast(0)
}

/** "Revision 3 · published 20 Dec" style line without a date library: the day part of the ISO instant. */
public fun TripPlan.revisionLine(): String = when {
    revision <= 0 -> "Not published yet"
    publishedAt == null -> "Revision $revision"
    else -> "Revision $revision · published ${publishedAt.take(10)}"
}
