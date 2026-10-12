// Copyright 2026- At Day. All rights reserved.
//
// Meeting window rules shared by Android and iOS (D15, slice 029): the device's own judgement
// from its fix (the only place a coordinate is ever compared), the distance formula, the mapping
// from the wire window to the screen model with schematic offsets (never positions), and the
// location port the platforms implement. No I/O here.

package com.voysemble.core.window

import com.voysemble.core.api.MeetingWindowDto
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/** One device fix. Stays on the device: only the judged state leaves it. */
public data class LocationFix(val lat: Double, val lng: Double, val accuracyMeters: Double)

/** The platform's location provider (one-shot); null when permission is missing or no fix comes. */
public fun interface LocationSource {
    public suspend fun fix(): LocationFix?
}

/** Great-circle distance in meters (haversine, mean Earth radius). */
public fun haversineMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
    val r = 6_371_000.0
    val dLat = (lat2 - lat1) * PI / 180
    val dLng = (lng2 - lng1) * PI / 180
    val a = sin(dLat / 2) * sin(dLat / 2) + cos(lat1 * PI / 180) * cos(lat2 * PI / 180) * sin(dLng / 2) * sin(dLng / 2)
    return 2 * r * asin(min(1.0, sqrt(a)))
}

/**
 * The device's judgement (same rule as the server's `windowStateOf`): inside when the fix lies
 * within the radius even at its worst accuracy; outside when beyond the radius even at its best;
 * uncertain in between or without a fix. Returns the wire name.
 */
public fun judgeWindowState(distanceMeters: Double?, accuracyMeters: Double, radiusMeters: Int): String = when {
    distanceMeters == null -> "uncertain"
    distanceMeters + accuracyMeters <= radiusMeters -> "inside"
    distanceMeters - accuracyMeters > radiusMeters -> "outside"
    else -> "uncertain"
}

/** The judged state for a fix against a meeting point, or uncertain without either. */
public fun judgeWindowState(fix: LocationFix?, centerLat: Double?, centerLng: Double?, radiusMeters: Int): String {
    if (fix == null || centerLat == null || centerLng == null) return "uncertain"
    return judgeWindowState(haversineMeters(fix.lat, fix.lng, centerLat, centerLng), fix.accuracyMeters, radiusMeters)
}

public fun windowStateOf(wire: String): WindowState = when (wire) {
    "inside" -> WindowState.INSIDE
    "outside" -> WindowState.OUTSIDE
    "uncertain" -> WindowState.UNCERTAIN
    "stale" -> WindowState.STALE
    else -> WindowState.OPTED_OUT
}

public fun WindowState.wireName(): String = when (this) {
    WindowState.INSIDE -> "inside"
    WindowState.OUTSIDE -> "outside"
    WindowState.UNCERTAIN -> "uncertain"
    WindowState.STALE -> "stale"
    WindowState.OPTED_OUT -> "opted_out"
}

/** Top-level twin of [wireName] for Swift, which cannot call a Kotlin extension on a bridged enum. */
public fun wireNameOf(state: WindowState): String = state.wireName()

/**
 * The judged state for a fix against the window's meeting point; uncertain when the window
 * carries no point (closed, or the viewer may not share) or there is no fix. Non-null primitives
 * only, so Swift calls it without boxing.
 */
public fun judgeWindowStateFor(fix: LocationFix?, window: MeetingWindowDto): String =
    judgeWindowState(fix, window.center?.lat, window.center?.lng, window.radiusMeters)

/** The window a device should show: the newest open one, else the newest scheduled one, else none. */
public fun currentWindowOf(windows: List<MeetingWindowDto>): MeetingWindowDto? =
    windows.firstOrNull { it.status == "open" } ?: windows.firstOrNull { it.status == "scheduled" }

/** The signed-in person's row with the state the server confirmed; unchanged for staff. */
public fun MeetingWindow.withSelfState(state: WindowState): MeetingWindow {
    val me = me ?: return this
    return copy(members = members.map { if (it.id == me.id) it.copy(state = state) else it })
}

/** The signed-in person's row in a window, or null for staff and for a closed window without rows. */
public fun selfStateOf(window: MeetingWindowDto, participationId: String): WindowState? =
    window.members.firstOrNull { it.participationId == participationId }?.let { windowStateOf(it.state) }

/**
 * Schematic offset for the zone drawing: a deterministic spot by state and index, never a
 * position. Inside spots sit within 0.75 r, uncertain and stale on the rim, outside beyond it.
 */
public fun schematicOffset(state: WindowState, index: Int): Pair<Float, Float> {
    val angle = index * 2.399963f // golden angle in radians, spreads spots evenly
    val radius = when (state) {
        WindowState.INSIDE -> 0.25f + 0.5f * ((index * 7) % 10) / 10f
        WindowState.UNCERTAIN -> 0.95f
        WindowState.STALE -> 1.0f
        WindowState.OUTSIDE -> 1.25f + 0.15f * ((index * 3) % 3)
        WindowState.OPTED_OUT -> 0f
    }
    return (radius * cos(angle)) to (radius * sin(angle))
}

/** The wire window as the screen model; `clock` renders ISO instants as local HH:mm. */
public fun MeetingWindowDto.toMeetingWindow(selfId: String?, clock: (iso: String) -> String): MeetingWindow {
    val members = this.members.mapIndexed { i, m ->
        val state = windowStateOf(m.state)
        val (dx, dy) = schematicOffset(state, i)
        WindowMember(m.participationId, m.displayName, state, dx, dy)
    }
    return MeetingWindow(
        id = id,
        label = label,
        place = place,
        startsAt = clock(startsAt),
        endsAt = clock(endsAt),
        radiusMeters = radiusMeters,
        openedBy = openedByName,
        groups = groups,
        members = members,
        selfId = selfId,
    )
}
