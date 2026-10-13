// Copyright 2026- At Day. All rights reserved.
//
// Live Today rules shared by Android and iOS (slice 024): which announcement rides on Today, how a
// wire announcement becomes the Today card, the snapshot adjustments the view models apply, and
// the honest empty snapshot shown before the first itinerary answer. Owning these here keeps the
// two apps identical and lets the JVM tests prove the rules once.

package com.voysemble.core.today

import com.voysemble.core.api.AnnouncementDto
import com.voysemble.core.api.HeadcountSessionDto
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr

/**
 * D19/D16: the required-ack announcement that rides on Today. The oldest unacknowledged one
 * first (clear the backlog in order); when everything is acknowledged, the latest one as a
 * reminder; null when nothing requires an acknowledgment.
 */
public fun latestRequiredAck(announcements: List<AnnouncementDto>): AnnouncementDto? {
    val required = announcements.filter { it.requiresAck }
    return required.filter { it.myAck != "acknowledged" }.minByOrNull { it.publishedAt }
        ?: required.maxByOrNull { it.publishedAt }
}

/** The wire announcement as the Today card; `clock` renders the ISO publish time as local HH:mm. */
public fun AnnouncementDto.toTodayAnnouncement(clock: (iso: String) -> String): TodayAnnouncement = TodayAnnouncement(
    id = id,
    title = title,
    body = body,
    author = authorName,
    publishedAt = clock(publishedAt),
    acknowledgedCount = ackCount,
    totalCount = ackTotal,
    ack = if (myAck == "acknowledged") AckState.ACKNOWLEDGED else AckState.UNACKNOWLEDGED,
)

/** Named copies so Swift does not have to spell every field of the data class. */
public fun TodaySnapshot.withAnnouncement(announcement: TodayAnnouncement?): TodaySnapshot = copy(announcement = announcement)

public fun TodaySnapshot.withOffline(offline: Boolean): TodaySnapshot = copy(offline = offline)

/** Minutes since the last successful sync (null: never); callable from Swift, where `copy` takes every field. */
public fun TodaySnapshot.withSyncAge(minutes: Int?): TodaySnapshot = copy(minutesSinceSync = minutes)

public fun TodaySnapshot.withHeadcount(groups: List<HeadcountGroup>): TodaySnapshot = copy(headcount = groups)

/**
 * Slice 086: the head count card on a leader's live Today. Today's sessions only (`dateOf` reads
 * the server's receipt instant as a trip-zone date, compared with `today`; a String-returning
 * function crosses to Swift as a plain closure), the newest per group, a whole-trip count under
 * its own label, groups in label order: the console's rule (`latestHeadcountGroups`). Accounted
 * (present, with another group, excused) is what the card counts as checked in. Empty before the
 * first count of the day.
 */
public fun headcountGroupsOf(
    sessions: List<HeadcountSessionDto>,
    today: String,
    dateOf: (receivedAt: String) -> String,
    wholeTrip: String = tr(Txt.TODAY_WHOLE_TRIP),
): List<HeadcountGroup> =
    sessions
        .filter { dateOf(it.receivedAt) == today }
        .groupBy { it.groupName ?: wholeTrip }
        .mapValues { (_, list) -> list.maxBy { it.receivedAt } }
        .toList()
        .sortedBy { it.first }
        .map { (label, s) -> HeadcountGroup(label, s.accounted, s.expected) }

/** Shown until the first itinerary answer: the trip name, nothing else invented. */
public fun emptyTodaySnapshot(tripName: String): TodaySnapshot = TodaySnapshot(
    tripName = tripName.ifBlank { tr(Txt.COMMON_YOUR_TRIP) },
    dayNumber = 0,
    dateLabel = "",
    timeZoneLabel = "",
    now = "00:00",
    events = emptyList(),
    announcement = null,
    headcount = emptyList(),
    minutesSinceSync = null,
    offline = false,
)
