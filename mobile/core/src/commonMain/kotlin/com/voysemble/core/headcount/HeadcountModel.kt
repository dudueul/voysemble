// Copyright 2026- At Day. All rights reserved.
//
// Head count model (D14, D25, ADR-0009). Local-first: a session is created, marked, and closed on
// the leader's device; `syncState` says whether the server has it. Closing is final; corrections
// are a new session. The missing list is derived, never stored. Pure Kotlin, no clock: device
// times are passed in as local HH:mm text.

package com.voysemble.core.headcount

import com.voysemble.core.window.WindowState

public enum class HeadcountMark { UNMARKED, PRESENT, MISSING, WITH_OTHER_GROUP, EXCUSED }

public enum class SyncState { PENDING, SYNCED }

public data class HeadcountMember(
    val id: String,
    val name: String,
    val room: String?,
    /** Local HH:mm of the last acknowledgment, if any. */
    val lastAckAt: String?,
    /** Latest meeting-window state, if a window is open; informs the missing list only. */
    val windowState: WindowState?,
)

public data class HeadcountSession(
    /** Client-minted id; doubles as the idempotency key on sync. */
    val id: String,
    val groupLabel: String,
    val openedBy: String,
    /** Local HH:mm on the device clock. */
    val openedAtDevice: String,
    val closedAtDevice: String?,
    val members: List<HeadcountMember>,
    val marks: Map<String, HeadcountMark>,
    val syncState: SyncState,
) {
    public fun markOf(memberId: String): HeadcountMark = marks[memberId] ?: HeadcountMark.UNMARKED
    public val isClosed: Boolean get() = closedAtDevice != null
    public val expected: Int get() = members.size
    public val presentCount: Int get() = members.count { markOf(it.id) == HeadcountMark.PRESENT }

    /** Members counted as accounted for: present, with another group, or excused. */
    public val accountedCount: Int
        get() = members.count { markOf(it.id) != HeadcountMark.UNMARKED && markOf(it.id) != HeadcountMark.MISSING }

    /** Pinned at the top of the screen: unmarked or missing members, unmarked first. */
    public val missing: List<HeadcountMember>
        get() = members
            .filter { markOf(it.id) == HeadcountMark.UNMARKED || markOf(it.id) == HeadcountMark.MISSING }
            .sortedWith(compareBy({ markOf(it.id) != HeadcountMark.MISSING }, { it.name }))

    public val closedWithMissing: Boolean get() = isClosed && missing.isNotEmpty()
}

/** Set a member's mark. Ignored after close (corrections are a new session). */
public fun HeadcountSession.mark(memberId: String, mark: HeadcountMark): HeadcountSession {
    if (isClosed || members.none { it.id == memberId }) return this
    return copy(marks = marks + (memberId to mark), syncState = SyncState.PENDING)
}

/** Toggle present/unmarked, the one-tap gesture on the list. */
public fun HeadcountSession.togglePresent(memberId: String): HeadcountSession =
    if (markOf(memberId) == HeadcountMark.PRESENT) mark(memberId, HeadcountMark.UNMARKED) else mark(memberId, HeadcountMark.PRESENT)

/**
 * Close on the device. Every unmarked member becomes MISSING so the record is explicit, and the
 * session stays PENDING until the server acknowledges it (then `markSynced`).
 */
public fun HeadcountSession.close(atDevice: String): HeadcountSession {
    if (isClosed) return this
    val finalMarks = members.associate { m -> m.id to (marks[m.id]?.takeIf { it != HeadcountMark.UNMARKED } ?: HeadcountMark.MISSING) }
    return copy(closedAtDevice = atDevice, marks = finalMarks, syncState = SyncState.PENDING)
}

public fun HeadcountSession.markSynced(): HeadcountSession = copy(syncState = SyncState.SYNCED)
