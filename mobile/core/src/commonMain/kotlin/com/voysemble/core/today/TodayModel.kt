// Copyright 2026- At Day. All rights reserved.
//
// Today screen model shared by Android and iOS. Owns: the snapshot shape the UI renders, the
// "up next" rule, and announcement acknowledgment state transitions. Pure Kotlin, no I/O, no clock:
// `now` is passed in as local wall-clock text so the rule is deterministic on every platform.
// Times are local HH:mm strings with an explicit zone label; instants belong to the server
// (doc 01 §13.5). Later slices feed this from SQLite + sync instead of the fixture.

package com.voysemble.core.today

public enum class EventKind { FLIGHT, BUS, MEAL, ACTIVITY, HOTEL, MEETING, FREE }

public enum class EventStatus { SCHEDULED, IN_PROGRESS, DONE, DELAYED, CANCELLED }

public data class TodayEvent(
    val id: String,
    /** Local start HH:mm. */
    val start: String,
    /** Local end HH:mm, optional. */
    val end: String?,
    val kind: EventKind,
    val title: String,
    val place: String,
    val status: EventStatus,
    val note: String?,
    /** True when this is a meeting point the traveler must reach. */
    val isMeetingPoint: Boolean,
)

/** Acknowledgment lifecycle. PENDING = queued locally, not yet confirmed by the server (doc 01 §11.4). */
public enum class AckState { UNACKNOWLEDGED, PENDING, ACKNOWLEDGED }

public data class TodayAnnouncement(
    val id: String,
    val title: String,
    val body: String,
    val author: String,
    /** Local HH:mm when published. */
    val publishedAt: String,
    val acknowledgedCount: Int,
    val totalCount: Int,
    val ack: AckState,
)

public data class HeadcountGroup(val label: String, val checkedIn: Int, val expected: Int)

public data class TodaySnapshot(
    val tripName: String,
    val dayNumber: Int,
    /** Local date label, e.g. "Thursday, Dec 31". Computed by the caller's locale layer. */
    val dateLabel: String,
    val timeZoneLabel: String,
    /** Local HH:mm "now" used for the up-next rule. */
    val now: String,
    val events: List<TodayEvent>,
    val announcement: TodayAnnouncement?,
    val headcount: List<HeadcountGroup>,
    /** Minutes since the last successful sync; null when never synced. */
    val minutesSinceSync: Int?,
    val offline: Boolean,
) {
    /** The first event that has not ended yet, by local time; in-progress events qualify. */
    public val upNext: TodayEvent?
        get() = events.firstOrNull { e ->
            val endOrStart = e.end ?: e.start
            e.status != EventStatus.DONE && e.status != EventStatus.CANCELLED && endOrStart >= now
        }

    /** Events after `upNext`, for the "later today" list. */
    public val later: List<TodayEvent>
        get() {
            val next = upNext ?: return emptyList()
            return events.filter { it.start >= next.start && it.id != next.id && it.status != EventStatus.DONE }
        }

    public val checkedIn: Int get() = headcount.sumOf { it.checkedIn }
    public val expected: Int get() = headcount.sumOf { it.expected }
}

/** Queue an acknowledgment locally. Server confirmation is a later slice; the UI shows PENDING until then. */
public fun TodaySnapshot.acknowledgeAnnouncement(id: String): TodaySnapshot {
    val a = announcement ?: return this
    if (a.id != id || a.ack != AckState.UNACKNOWLEDGED) return this
    return copy(announcement = a.copy(ack = AckState.PENDING))
}

/** Apply a server confirmation (used by sync later; exposed now so the state machine is complete). */
public fun TodaySnapshot.confirmAcknowledgment(id: String): TodaySnapshot {
    val a = announcement ?: return this
    if (a.id != id || a.ack != AckState.PENDING) return this
    return copy(announcement = a.copy(ack = AckState.ACKNOWLEDGED, acknowledgedCount = a.acknowledgedCount + 1))
}
