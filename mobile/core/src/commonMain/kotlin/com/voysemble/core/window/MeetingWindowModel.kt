// Copyright 2026- At Day. All rights reserved.
//
// Meeting window model (D15, ADR-0009). A leader opens a window (time range + zone radius);
// travelers opt in per window; the server reports a coarse state per member. No coordinates are
// stored here: positions for the schematic map are unit-disc offsets, never lat/lng. Pure Kotlin.

package com.voysemble.core.window

public enum class WindowState { INSIDE, OUTSIDE, UNCERTAIN, STALE, OPTED_OUT }

public data class WindowMember(
    val id: String,
    val name: String,
    val state: WindowState,
    /** Offset from the zone centre as a fraction of the radius; schematic only. */
    val dx: Float,
    val dy: Float,
)

public data class MeetingWindow(
    val id: String,
    val label: String,
    val place: String,
    /** Local HH:mm. */
    val startsAt: String,
    val endsAt: String,
    val radiusMeters: Int,
    val openedBy: String,
    val groups: List<String>,
    val members: List<WindowMember>,
    /** The signed-in traveler, when this device belongs to one. Null on a leader device. */
    val selfId: String?,
) {
    public fun isOpenAt(now: String): Boolean = now >= startsAt && now < endsAt

    /** Minutes until `endsAt`, or 0 once closed. `now`/`endsAt` are local HH:mm on the same day. */
    public fun minutesLeftAt(now: String): Int {
        val end = endsAt.toMinutes()
        val cur = now.toMinutes()
        return if (cur >= end) 0 else end - cur
    }

    public val self: WindowMember? get() = members.firstOrNull { it.id == selfId }
    public val selfOptedIn: Boolean get() = self?.state?.let { it != WindowState.OPTED_OUT } ?: false

    public fun count(state: WindowState): Int = members.count { it.state == state }
    public val insideCount: Int get() = count(WindowState.INSIDE)
    public val sharingCount: Int get() = members.count { it.state != WindowState.OPTED_OUT }
}

/** The traveler opts in: state becomes UNCERTAIN until the first report lands. No-op for others. */
public fun MeetingWindow.optIn(): MeetingWindow {
    val me = self ?: return this
    if (me.state != WindowState.OPTED_OUT) return this
    return copy(members = members.map { if (it.id == me.id) it.copy(state = WindowState.UNCERTAIN) else it })
}

/** The traveler opts out at any time; the device stops sending and the state is OPTED_OUT. */
public fun MeetingWindow.optOut(): MeetingWindow {
    val me = self ?: return this
    if (me.state == WindowState.OPTED_OUT) return this
    return copy(members = members.map { if (it.id == me.id) it.copy(state = WindowState.OPTED_OUT) else it })
}

internal fun String.toMinutes(): Int {
    val h = substring(0, 2).toInt()
    val m = substring(3, 5).toInt()
    return h * 60 + m
}
