// Copyright 2026- At Day. All rights reserved.
//
// Synthetic fixture mirroring apps/organizer-web/src/fixtures (same trip, same Day 4 at 07:12
// Rome). No real institution, person, flight, or venue. Used by both apps until sync exists.

package com.voysemble.core.fixtures

import com.voysemble.core.today.AckState
import com.voysemble.core.today.EventKind
import com.voysemble.core.today.EventStatus
import com.voysemble.core.today.HeadcountGroup
import com.voysemble.core.today.TodayAnnouncement
import com.voysemble.core.today.TodayEvent
import com.voysemble.core.today.TodaySnapshot

public object KoreaConcertTourFixture {
    public const val TRIP_NAME: String = "Korea Concert Tour"

    /** Day 4, Thursday Dec 31 2026, 07:12 Europe/Rome. */
    public fun today(): TodaySnapshot = TodaySnapshot(
        tripName = TRIP_NAME,
        dayNumber = 4,
        dateLabel = "Thursday, Dec 31",
        timeZoneLabel = "Rome",
        now = "07:12",
        events = listOf(
            TodayEvent("ev_1", "07:30", "08:15", EventKind.MEAL, "Breakfast", "Hotel de la Ville, restaurant", EventStatus.SCHEDULED, null, false),
            TodayEvent("ev_2", "07:30", null, EventKind.MEETING, "Meet in the hotel lobby", "Hotel de la Ville, lobby", EventStatus.SCHEDULED, "Moved from 07:00 by the tour leader", true),
            TodayEvent("ev_3", "08:00", "08:45", EventKind.BUS, "Bus A and Bus B depart", "Via Sistina stop", EventStatus.SCHEDULED, null, false),
            TodayEvent("ev_4", "09:00", "11:00", EventKind.ACTIVITY, "Colosseum guided tour", "Colosseum, main entrance", EventStatus.SCHEDULED, null, false),
            TodayEvent("ev_5", "12:00", "13:30", EventKind.MEAL, "Lunch", "Trattoria Luciani", EventStatus.SCHEDULED, null, false),
            TodayEvent("ev_6", "14:30", "16:00", EventKind.ACTIVITY, "Roman Forum walk", "Via Sacra", EventStatus.SCHEDULED, null, false),
            TodayEvent("ev_7", "17:30", "19:00", EventKind.ACTIVITY, "New Year concert rehearsal", "Auditorium Parco della Musica", EventStatus.DELAYED, "Venue access delayed 30 min", false),
            TodayEvent("ev_8", "20:00", "22:00", EventKind.MEAL, "New Year dinner", "Hotel de la Ville, restaurant", EventStatus.SCHEDULED, null, false),
        ),
        announcement = TodayAnnouncement(
            id = "an_departure",
            title = "Departure moved to 07:30",
            body = "Please bring your concert attire. Breakfast is open from 06:30.",
            author = "Tour leader",
            publishedAt = "06:30",
            acknowledgedCount = 32,
            totalCount = 38,
            ack = AckState.UNACKNOWLEDGED,
        ),
        headcount = listOf(HeadcountGroup("Bus A", 18, 20), HeadcountGroup("Bus B", 16, 18)),
        minutesSinceSync = 1,
        offline = false,
    )
}
