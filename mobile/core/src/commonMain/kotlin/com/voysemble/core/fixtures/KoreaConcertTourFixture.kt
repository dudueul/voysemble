// Copyright 2026- At Day. All rights reserved.
//
// Synthetic fixture mirroring apps/organizer-web/src/fixtures (same trip, same Day 4 at 07:12
// Rome). No real institution, person, flight, or venue. Used by both apps until sync exists.

package com.voysemble.core.fixtures

import com.voysemble.core.announcements.AnnouncementFeed
import com.voysemble.core.announcements.AnnouncementItem
import com.voysemble.core.headcount.HeadcountMark
import com.voysemble.core.headcount.HeadcountMember
import com.voysemble.core.headcount.HeadcountSession
import com.voysemble.core.headcount.SyncState
import com.voysemble.core.today.AckState
import com.voysemble.core.today.EventKind
import com.voysemble.core.today.EventStatus
import com.voysemble.core.today.HeadcountGroup
import com.voysemble.core.today.TodayAnnouncement
import com.voysemble.core.today.TodayEvent
import com.voysemble.core.today.TodaySnapshot
import com.voysemble.core.window.MeetingWindow
import com.voysemble.core.window.WindowMember
import com.voysemble.core.window.WindowState

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

    /** Bus A head count opened by leader Kim Daeun at 06:50 device time; 18 of 20 marked present. */
    public fun headcountBusA(): HeadcountSession {
        val names = listOf(
            "Minji Park" to "412", "Juho Kim" to "412", "Seojun Choi" to "415", "Jiwoo Han" to "415",
            "Eunwoo Shin" to "408", "Hyunwoo Nam" to "408", "Dohyun Kang" to "412", "Yejun Song" to "416",
            "Siwoo Jang" to "416", "Hajun Yoon" to "417", "Jun Seo" to "417", "Ian Moon" to "418",
            "Ara Bae" to "418", "Nari Kwon" to "419", "Dana Hong" to "419", "Mina Cho" to "420",
            "Soyul Ryu" to "420", "Haeun Baek" to "421", "Rin Heo" to "421", "Yul Kang" to "422",
        )
        val members = names.mapIndexed { i, (name, room) ->
            HeadcountMember(
                id = "t${i + 1}",
                name = name,
                room = room,
                lastAckAt = if (i % 5 == 4) null else "06:${(40 + i % 15).toString().padStart(2, '0')}",
                windowState = when (name) { "Dohyun Kang" -> WindowState.OUTSIDE; "Eunwoo Shin" -> WindowState.STALE; else -> null },
            )
        }
        val missing = setOf("Dohyun Kang", "Eunwoo Shin")
        return HeadcountSession(
            id = "hc_busA_20261231_0650",
            groupLabel = "Bus A",
            openedBy = "Kim Daeun",
            openedAtDevice = "06:50",
            closedAtDevice = null,
            members = members,
            marks = members.filter { it.name !in missing }.associate { it.id to HeadcountMark.PRESENT },
            syncState = SyncState.SYNCED,
        )
    }

    /** Bulletin: three announcements, the first requiring an ack and carrying a KO machine translation. */
    public fun announcements(): AnnouncementFeed = AnnouncementFeed(
        items = listOf(
            AnnouncementItem(
                id = "an_departure",
                title = "Departure moved to 07:30",
                body = "Please bring your concert attire. Breakfast is open from 06:30.",
                machineTranslation = "공연 의상을 꼭 챙겨 주세요. 아침 식사는 06:30부터입니다.",
                author = "Tour leader",
                publishedAt = "06:30",
                requiresAck = true,
                sharedWithGuardians = true,
                ack = AckState.UNACKNOWLEDGED,
                acknowledgedCount = 32,
                totalCount = 38,
            ),
            AnnouncementItem(
                id = "an_colosseum",
                title = "Colosseum: meet at the blue flag",
                body = "We meet at 08:30 outside the main entrance. Look for the blue flag.",
                machineTranslation = "08:30에 정문 밖에서 모입니다. 파란 깃발을 찾으세요.",
                author = "Kim Daeun",
                publishedAt = "Yesterday 18:00",
                requiresAck = true,
                sharedWithGuardians = false,
                ack = AckState.ACKNOWLEDGED,
                acknowledgedCount = 38,
                totalCount = 38,
            ),
            AnnouncementItem(
                id = "an_album",
                title = "Day 3 photo album is up",
                body = "24 photos approved by leaders are in the guardian album.",
                machineTranslation = null,
                author = "Organizer",
                publishedAt = "Yesterday 17:10",
                requiresAck = false,
                sharedWithGuardians = true,
                ack = AckState.ACKNOWLEDGED,
                acknowledgedCount = 0,
                totalCount = 38,
            ),
        ),
        outbox = emptyList(),
        offline = false,
    )

    /** Colosseum regroup window 10:45-11:20, 200 m, as seen by traveler Minji (t1), not yet opted in. */
    public fun meetingWindow(): MeetingWindow = MeetingWindow(
        id = "w1",
        label = "Colosseum regroup",
        place = "Colosseum, main entrance",
        startsAt = "10:45",
        endsAt = "11:20",
        radiusMeters = 200,
        openedBy = "Kim Daeun",
        groups = listOf("Bus A", "Bus B"),
        members = listOf(
            WindowMember("t1", "Minji Park", WindowState.OPTED_OUT, 0f, 0f),
            WindowMember("t2", "Juho Kim", WindowState.INSIDE, 0.2f, -0.4f),
            WindowMember("t3", "Hana Lee", WindowState.INSIDE, 0.5f, 0.3f),
            WindowMember("t5", "Yuna Jung", WindowState.INSIDE, -0.6f, -0.1f),
            WindowMember("t6", "Dohyun Kang", WindowState.OUTSIDE, 1.3f, 0.6f),
            WindowMember("t8", "Taeyang Oh", WindowState.INSIDE, 0.1f, 0.7f),
            WindowMember("t9", "Eunwoo Shin", WindowState.STALE, -0.9f, 0.9f),
            WindowMember("t10", "Sua Lim", WindowState.INSIDE, 0.4f, -0.1f),
            WindowMember("t11", "Hyunwoo Nam", WindowState.UNCERTAIN, 0.9f, -0.8f),
        ),
        selfId = "t1",
    )
}
