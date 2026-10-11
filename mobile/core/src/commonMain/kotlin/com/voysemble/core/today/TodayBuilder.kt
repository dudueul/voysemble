// Copyright 2026- At Day. All rights reserved.
//
// Builds the Today snapshot from a published itinerary (slice 017). Pure Kotlin: the caller
// passes the device's calendar date in the trip's zone and the local HH:mm "now", so the rule is
// deterministic on every platform and in tests. Announcements and head counts arrive from their
// own feeds; this builder leaves them empty.

package com.voysemble.core.today

import com.voysemble.core.api.ItineraryDto
import com.voysemble.core.api.ItineraryEventDto

public fun eventKindOf(wire: String): EventKind = when (wire) {
    "flight" -> EventKind.FLIGHT
    "bus" -> EventKind.BUS
    "meal" -> EventKind.MEAL
    "hotel" -> EventKind.HOTEL
    "meeting" -> EventKind.MEETING
    "free" -> EventKind.FREE
    else -> EventKind.ACTIVITY
}

public fun eventStatusOf(wire: String): EventStatus = when (wire) {
    "in_progress" -> EventStatus.IN_PROGRESS
    "done" -> EventStatus.DONE
    "delayed" -> EventStatus.DELAYED
    "cancelled" -> EventStatus.CANCELLED
    else -> EventStatus.SCHEDULED
}

public fun ItineraryEventDto.toTodayEvent(): TodayEvent = TodayEvent(
    id = id,
    start = start,
    end = end,
    kind = eventKindOf(kind),
    title = title,
    place = place,
    status = eventStatusOf(status),
    note = note,
    isMeetingPoint = kind == "meeting",
)

private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
private val WEEKDAYS = listOf("Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday")

/** Days since 1970-01-01 for a YYYY-MM-DD date (proleptic Gregorian, no time zone). */
public fun epochDayOf(date: String): Long {
    val (y, m, d) = date.split("-").map { it.toInt() }
    val yy = if (m <= 2) y - 1 else y
    val era = (if (yy >= 0) yy else yy - 399) / 400
    val yoe = yy - era * 400
    val mp = (m + 9) % 12
    val doy = (153 * mp + 2) / 5 + d - 1
    val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146097L + doe - 719468L
}

/** "Thursday, Dec 31" for 2026-12-31. 1970-01-01 was a Thursday. */
public fun dateLabelOf(date: String): String {
    val day = epochDayOf(date)
    val weekday = WEEKDAYS[((day % 7 + 7) % 7).toInt()]
    val (_, m, d) = date.split("-").map { it.toInt() }
    return "$weekday, ${MONTHS[m - 1]} $d"
}

/** "Rome" for "Europe/Rome", "New York" for "America/New_York". */
public fun zoneLabelOf(timeZone: String): String = timeZone.substringAfterLast('/').replace('_', ' ')

/**
 * The Today snapshot for `date` (YYYY-MM-DD in the trip's zone) at local `now` (HH:mm). Day
 * numbers count from the trip start; a date outside the trip still renders (day 0 or beyond)
 * so a leader opening the app early sees an honest, empty Today.
 */
public fun todaySnapshotOf(
    itinerary: ItineraryDto,
    date: String,
    now: String,
    minutesSinceSync: Int? = 0,
    offline: Boolean = false,
): TodaySnapshot {
    val events = itinerary.events
        .filter { it.date == date }
        .sortedWith(compareBy({ it.order }, { it.start }))
        .map { it.toTodayEvent() }
    val zone = itinerary.days.firstOrNull { it.date == date }?.timeZone ?: itinerary.days.firstOrNull()?.timeZone ?: "UTC"
    val dayNumber = (epochDayOf(date) - epochDayOf(itinerary.startDate) + 1).toInt()
    return TodaySnapshot(
        tripName = itinerary.tripName,
        dayNumber = dayNumber,
        dateLabel = dateLabelOf(date),
        timeZoneLabel = zoneLabelOf(zone),
        now = now,
        events = events,
        announcement = null,
        headcount = emptyList(),
        minutesSinceSync = minutesSinceSync,
        offline = offline,
    )
}
