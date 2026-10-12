// Copyright 2026- At Day. All rights reserved.
//
// Synthetic fixture mirroring apps/organizer-web/src/fixtures (same trip, same Day 4 at 07:12
// Rome). No real institution, person, flight, or venue. Used by both apps until sync exists.

package com.voysemble.core.fixtures

import com.voysemble.core.api.CareNoteDto
import com.voysemble.core.chat.ChatChannel
import com.voysemble.core.chat.ChatMessage
import com.voysemble.core.chat.ChatThread
import com.voysemble.core.memories.MemoriesFeed
import com.voysemble.core.memories.Memory
import com.voysemble.core.announcements.AnnouncementFeed
import com.voysemble.core.announcements.AnnouncementItem
import com.voysemble.core.api.GuardianCountDto
import com.voysemble.core.api.GuardianFeeDto
import com.voysemble.core.api.GuardianStatusDto
import com.voysemble.core.api.GuardianTravelerDto
import com.voysemble.core.headcount.HeadcountMark
import com.voysemble.core.headcount.HeadcountMember
import com.voysemble.core.headcount.HeadcountSession
import com.voysemble.core.headcount.SyncState
import com.voysemble.core.incidents.ConfirmationStatus
import com.voysemble.core.incidents.IncidentCard
import com.voysemble.core.incidents.IncidentConfirmation
import com.voysemble.core.incidents.IncidentFeed
import com.voysemble.core.incidents.IncidentStatus
import com.voysemble.core.plan.PlanDay
import com.voysemble.core.plan.TripPlan
import com.voysemble.core.packing.PackingItem
import com.voysemble.core.packing.PackingList
import com.voysemble.core.notifications.Inbox
import com.voysemble.core.notifications.InboxItem
import com.voysemble.core.notifications.InboxKind
import com.voysemble.core.notifications.Lane
import com.voysemble.core.travel.BusCharter
import com.voysemble.core.travel.Flight
import com.voysemble.core.travel.Hotel
import com.voysemble.core.travel.TripTravel
import com.voysemble.core.today.AckState
import com.voysemble.core.today.EventKind
import com.voysemble.core.today.EventStatus
import com.voysemble.core.today.GuardianCard
import com.voysemble.core.today.guardianCardOf
import com.voysemble.core.today.HeadcountGroup
import com.voysemble.core.today.TodayAnnouncement
import com.voysemble.core.today.TodayEvent
import com.voysemble.core.today.TodaySnapshot
import com.voysemble.core.window.MeetingWindow
import com.voysemble.core.window.WindowMember
import com.voysemble.core.window.WindowState

public object KoreaConcertTourFixture {
    public const val TRIP_NAME: String = "Korea Concert Tour"

    /** The calendar date the sample screens live on (day 4 of the fixture trip). */
    public const val TODAY_DATE: String = "2026-12-31"

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

    /**
     * The whole plan (slice 035): four of the trip's days, Dec 28 to Dec 31 in Rome; day 4 is
     * the Today fixture's list. Revision 3, published before departure.
     */
    public fun plan(): TripPlan = TripPlan(
        tripName = TRIP_NAME,
        revision = 3,
        publishedAt = "2026-12-20T09:00:00.000Z",
        days = listOf(
            PlanDay(
                date = "2026-12-28", label = "Arrival", dateLabel = "Monday, Dec 28", timeZone = "Europe/Rome", timeZoneLabel = "Rome", dayNumber = 1,
                events = listOf(
                    TodayEvent("d1_1", "06:10", "13:40", EventKind.FLIGHT, "Flight to Rome", "Incheon T2, gate 231", EventStatus.DONE, null, false),
                    TodayEvent("d1_2", "15:00", "16:00", EventKind.BUS, "Coach to the hotel", "Fiumicino, bus bay 4", EventStatus.DONE, null, false),
                    TodayEvent("d1_3", "17:30", null, EventKind.HOTEL, "Check-in and room keys", "Hotel de la Ville", EventStatus.DONE, null, false),
                    TodayEvent("d1_4", "19:30", "21:00", EventKind.MEAL, "Welcome dinner", "Hotel de la Ville, restaurant", EventStatus.DONE, null, false),
                ),
                nextOrder = 4,
            ),
            PlanDay(
                date = "2026-12-29", label = "Vatican", dateLabel = "Tuesday, Dec 29", timeZone = "Europe/Rome", timeZoneLabel = "Rome", dayNumber = 2,
                events = listOf(
                    TodayEvent("d2_1", "07:30", "08:15", EventKind.MEAL, "Breakfast", "Hotel de la Ville, restaurant", EventStatus.DONE, null, false),
                    TodayEvent("d2_2", "09:00", "12:30", EventKind.ACTIVITY, "Vatican Museums", "Viale Vaticano entrance", EventStatus.DONE, null, false),
                    TodayEvent("d2_3", "13:00", "14:00", EventKind.MEAL, "Lunch", "Borgo Pio", EventStatus.DONE, null, false),
                    TodayEvent("d2_4", "16:00", "18:00", EventKind.ACTIVITY, "Rehearsal", "Auditorium Parco della Musica", EventStatus.DONE, null, false),
                ),
                nextOrder = 4,
            ),
            PlanDay(
                date = "2026-12-30", label = "Free day", dateLabel = "Wednesday, Dec 30", timeZone = "Europe/Rome", timeZoneLabel = "Rome", dayNumber = 3,
                events = listOf(
                    TodayEvent("d3_1", "07:30", "08:15", EventKind.MEAL, "Breakfast", "Hotel de la Ville, restaurant", EventStatus.DONE, null, false),
                    TodayEvent("d3_2", "09:00", "17:00", EventKind.FREE, "Free time in groups", "Centro Storico", EventStatus.DONE, "Leaders carry the group phones", false),
                    TodayEvent("d3_3", "18:30", null, EventKind.MEETING, "Regroup", "Hotel de la Ville, lobby", EventStatus.DONE, null, true),
                ),
                nextOrder = 3,
            ),
            PlanDay(
                date = "2026-12-31", label = "Concert day", dateLabel = "Thursday, Dec 31", timeZone = "Europe/Rome", timeZoneLabel = "Rome", dayNumber = 4,
                events = today().events,
                nextOrder = 8,
            ),
        ),
        offline = false,
        minutesSinceSync = 1,
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
                hasCareNote = name == "Minji Park",
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

    /** Incidents: one open card from the Bus B head count, one confirmed and resolved earlier (D17). */
    public fun incidents(): IncidentFeed = IncidentFeed(
        cards = listOf(
            IncidentCard(
                id = "inc_busB_0650",
                title = "Head count closed with 2 missing (Bus B, 06:50)",
                status = IncidentStatus.OPEN,
                people = listOf("Dohyun Kang", "Eunwoo Shin"),
                openedAt = "06:52",
                openedBy = "Lee Minho",
                confirmations = emptyList(),
                guardianMessage = null,
            ),
            IncidentCard(
                id = "inc_phone_lost",
                title = "Phone lost, not reachable",
                status = IncidentStatus.RESOLVED,
                people = listOf("Minji Park"),
                openedAt = "14:30",
                openedBy = "Organizer",
                confirmations = listOf(IncidentConfirmation(ConfirmationStatus.WITH_GROUP, "Phone lost.", "Kim Daeun", "15:42")),
                guardianMessage = "Minji Park is with the group. Phone lost. Confirmed by leader Kim Daeun at 15:42.",
            ),
        ),
        offline = false,
    )

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
            AnnouncementItem(
                id = "an_revision_7",
                title = "Itinerary updated",
                body = "The itinerary was updated: 3 changes.\nDay 4: Colosseum guided tour now 08:30 (was 09:00).\nDay 4: Gelato stop added at 11:15.\nDay 5: Lunch removed.\nPlease tap \"Got it\" so your leader knows you have seen this.",
                machineTranslation = null,
                author = "Organizer",
                publishedAt = "22:10",
                requiresAck = true,
                sharedWithGuardians = true,
                ack = AckState.ACKNOWLEDGED,
                acknowledgedCount = 38,
                totalCount = 38,
                kind = "itinerary_revision",
                revisionNumber = 7,
                changeLines = listOf(
                    "Day 4 · Colosseum guided tour · 09:00 → 08:30",
                    "Day 4 · Gelato stop · added 11:15",
                    "Day 5 · Lunch · removed",
                ),
            ),
        ),
        outbox = emptyList(),
        offline = false,
    )

    /** Guardian Sora's view of Minji (D13): counted present on Bus A at 06:52 by Kim Daeun, no incident. */
    public fun guardianStatus(): GuardianStatusDto = GuardianStatusDto(
        traveler = GuardianTravelerDto("t1", "Minji Park", "Bus A"),
        count = GuardianCountDto("present", "hc_busA_20261231_0650", "Bus A", closed = false, atDevice = "06:52", byName = "Kim Daeun", receivedAt = "2026-12-31T05:52:30.000Z"),
        incident = null,
        itineraryRevision = 7,
        fee = GuardianFeeDto("KRW", 2_400_000, 1_200_000, 0, 1_200_000, "2026-11-30", "partial"),
    )

    public fun guardianCard(locale: String = "en"): GuardianCard = guardianCardOf(guardianStatus(), locale)

    /** Colosseum regroup window 10:45-11:20, 200 m, as seen by traveler Minji (t1), not yet opted in. */
    /** Minji's channels (D22): everyone, her group, her leaders. */
    public fun chats(): List<ChatChannel> = listOf(
        ChatChannel("trip", "trip", "Everyone on the trip", "38 travelers · 2 leaders · the organizer", 0, "Breakfast moved to 06:30, lobby. Bus leaves 07:15.", "05:40"),
        ChatChannel("group:Bus A", "group", "Bus A", "20 travelers · 1 leader", 3, "Who has the charger?", "06:05"),
        ChatChannel("traveler:t1", "traveler", "Your leaders", "with Kim Daeun", 1, "We leave at 07:15, be in the lobby.", "06:41"),
    )

    /** The "Your leaders" thread as Minji sees it. */
    public fun chatThread(): ChatThread = ChatThread(
        channel = chats()[2],
        messages = listOf(
            ChatMessage("m1", "traveler:t1", "Minji Park", "traveler", "I left my passport at the hotel desk, is that ok?", "06:30", mine = true),
            ChatMessage("m2", "traveler:t1", "Kim Daeun", "leader", "Yes, the desk keeps them until checkout. Bring it on the last day.", "06:33", mine = false),
            ChatMessage("m3", "traveler:t1", "Minji Park", "traveler", "Thank you!", "06:34", mine = true),
            ChatMessage("m4", "traveler:t1", "Kim Daeun", "leader", "We leave at 07:15, be in the lobby.", "06:41", mine = false),
        ),
    )

    /** The sample pool as leader Kim sees it (D18, slice 044): one flagged, one in the album. */
    public fun memories(): MemoriesFeed = MemoriesFeed(
        photos = listOf(
            Memory("ph1", "Juho Kim", mine = false, day = 4, status = "flagged", flag = "nudity", taggedNames = emptyList(), wholeGroup = false, thumbnailPath = "", contentPath = ""),
            Memory("ph2", "Minji Park", mine = false, day = 4, status = "approved", flag = null, taggedNames = listOf("Minji Park"), wholeGroup = false, thumbnailPath = "", contentPath = ""),
            Memory("ph3", "Kim Daeun", mine = true, day = 4, status = "approved", flag = null, taggedNames = emptyList(), wholeGroup = true, thumbnailPath = "", contentPath = ""),
            Memory("ph4", "Sua Lim", mine = false, day = 3, status = "pool", flag = null, taggedNames = emptyList(), wholeGroup = false, thumbnailPath = "", contentPath = ""),
            Memory("ph5", "Juho Kim", mine = false, day = 3, status = "pool", flag = null, taggedNames = emptyList(), wholeGroup = false, thumbnailPath = "", contentPath = ""),
            Memory("ph6", "Kim Daeun", mine = true, day = 2, status = "pool", flag = null, taggedNames = emptyList(), wholeGroup = false, thumbnailPath = "", contentPath = ""),
        ),
    )

    /** The sample bookings (D37, slice 047): the two flights, two hotels and two buses of the tour. */
    public fun travel(): TripTravel = TripTravel(
        flights = listOf(
            Flight("fl1", "DEMO 901", "ICN", "FCO", "2026-12-28T13:30", "2026-12-28T18:55", pax = 42, pnr = "VYS8K2", status = "done"),
            Flight("fl2", "DEMO 902", "FCO", "ICN", "2027-01-06T21:10", "2027-01-07T16:05", pax = 42, pnr = "VYS8K2", status = "scheduled"),
        ),
        hotels = listOf(
            Hotel("ho1", "Hotel de la Ville", "Rome", "2026-12-28", "2027-01-02", rooms = 21, confirmation = "HDLV-2026-1228", nights = 5),
            Hotel("ho2", "Hotel Brunelleschi", "Florence", "2027-01-02", "2027-01-06", rooms = 21, confirmation = "HBR-2027-0102", nights = 4),
        ),
        buses = listOf(
            BusCharter("bu1", "Bus A", "Roma Coach", seats = 45, groups = listOf("Bus A"), assigned = 20),
            BusCharter("bu2", "Bus B", "Roma Coach", seats = 45, groups = listOf("Bus B"), assigned = 19),
        ),
    )

    /** The sample packing list (D38, slice 048): nine items, six in the bag. */
    public fun packing(): PackingList = PackingList(
        items = listOf(
            PackingItem("pk1", "Passport + copy", "", packed = true, packedAt = "2026-12-20T09:00:00.000Z"),
            PackingItem("pk2", "Concert attire (black)", "Pressed, in the garment bag", packed = true, packedAt = "2026-12-21T10:00:00.000Z"),
            PackingItem("pk3", "Sheet music folder", "", packed = true, packedAt = "2026-12-21T10:05:00.000Z"),
            PackingItem("pk4", "Instrument + spare strings", "", packed = true, packedAt = "2026-12-22T08:00:00.000Z"),
            PackingItem("pk5", "Warm coat", "Rome is cold in December", packed = true, packedAt = "2026-12-22T08:10:00.000Z"),
            PackingItem("pk6", "Comfortable shoes", "", packed = true, packedAt = "2026-12-22T08:12:00.000Z"),
            PackingItem("pk7", "EU plug adapter", "Type C or F", packed = false, packedAt = null),
            PackingItem("pk8", "Medication with doctor note", "", packed = false, packedAt = null),
            PackingItem("pk9", "Pocket money (EUR)", "", packed = false, packedAt = null),
        ),
        travelerName = "Minji Park",
        forTraveler = false,
    )

    /**
     * The sample inbox (D29, slice 053): what the lanes delivered to a leader by 07:12 on day 4;
     * the head-count call and the concert announcement are still unread. Labels as the phone's
     * clock would print them on that morning.
     */
    public fun inbox(): Inbox = Inbox(
        items = listOf(
            InboxItem("nt1", Lane.PRIORITY, InboxKind.HEADCOUNT_CALL, "Head count: Bus A", "Kim Daeun opened a count in the hotel lobby. Mark your group before the bus.", "headcount", "hc1", "2026-12-31T05:52:00.000Z", "06:52", read = false),
            InboxItem("nt2", Lane.NORMAL, InboxKind.ANNOUNCEMENT, "Concert call time moved to 17:30", "Be in the lobby in concert attire by 17:20; the bus leaves at 17:30 sharp.", "announcement", "an2", "2026-12-31T05:40:00.000Z", "06:40", read = false),
            InboxItem("nt3", Lane.NORMAL, InboxKind.ITINERARY_REVISION, "Plan updated (revision 3)", "Breakfast now 07:30; the Colosseum regroup is at 10:45 at the main entrance.", "announcement", "an3", "2026-12-30T20:05:00.000Z", "12-30 21:05", read = true),
            InboxItem("nt4", Lane.PRIORITY, InboxKind.PROPOSAL_DECIDED, "Proposal accepted: Gelato on the way back", "Hana accepted it: added at 16:15 on the concert day.", "proposal", "pr1", "2026-12-30T17:12:00.000Z", "12-30 18:12", read = true),
            InboxItem("nt5", Lane.PRIORITY, InboxKind.INCIDENT_STATUS, "With the group: Minji Park", "Kim Daeun confirmed Minji is with the group after the count at the Colosseum.", "incident", "in1", "2026-12-30T10:30:00.000Z", "12-30 11:30", read = true),
        ),
    )

    /** Minji's care note as the sample head count reveals it (D27). */
    public fun careNote(): CareNoteDto = CareNoteDto(allergies = "Peanuts", medications = "EpiPen in the red bag", freeText = "Asks for it herself.")

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
