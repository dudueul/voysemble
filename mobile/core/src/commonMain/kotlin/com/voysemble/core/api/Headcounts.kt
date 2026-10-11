// Copyright 2026- At Day. All rights reserved.
//
// Head count wire types (mirror of packages/contracts/src/headcount.ts) and the device → server
// push. The device owns the session (D14, D25): it is minted, marked, and closed on the phone and
// sent as one idempotent PUT keyed by the client id. Replaying is always safe; a session the
// server already holds closed is simply acknowledged (`applied: false`) and counts as synced.
// Also the roster read that seeds a live session with the leader's group.

package com.voysemble.core.api

import com.voysemble.core.headcount.HeadcountMark
import com.voysemble.core.headcount.HeadcountMember
import com.voysemble.core.headcount.HeadcountSession
import com.voysemble.core.headcount.SyncState
import com.voysemble.core.headcount.markSynced
import kotlinx.serialization.Serializable

@Serializable
public data class HeadcountMarkInputDto(val participationId: String, val mark: String)

@Serializable
public data class SyncHeadcountRequestDto(
    val openedAtDevice: String,
    val closedAtDevice: String?,
    /** Null = whole trip. */
    val groupName: String?,
    val marks: List<HeadcountMarkInputDto>,
)

@Serializable
public data class HeadcountMissingDto(
    val participationId: String,
    val displayName: String,
    val groupName: String? = null,
    val mark: String,
)

@Serializable
public data class HeadcountSessionDto(
    val id: String,
    val tripId: String,
    val groupName: String? = null,
    val openedByName: String,
    val openedAtDevice: String,
    val closedAtDevice: String? = null,
    val receivedAt: String,
    val expected: Int,
    val present: Int,
    val accounted: Int,
    val missing: List<HeadcountMissingDto>,
    val closedWithMissing: Boolean,
)

@Serializable
public data class SyncHeadcountResponseDto(
    val session: HeadcountSessionDto,
    val applied: Boolean,
    /** The incident card the server opened because this close left travelers missing (D25). */
    val incidentId: String? = null,
)

@Serializable
public data class HeadcountListDto(val headcounts: List<HeadcountSessionDto>)

@Serializable
public data class RosterResponseDto(val participations: List<ParticipationDto>)

/** Wire name of a device mark; UNMARKED has no wire form (the server treats absence as missing). */
public fun HeadcountMark.wireName(): String? = when (this) {
    HeadcountMark.UNMARKED -> null
    HeadcountMark.PRESENT -> "present"
    HeadcountMark.MISSING -> "missing"
    HeadcountMark.WITH_OTHER_GROUP -> "with_other_group"
    HeadcountMark.EXCUSED -> "excused"
}

/**
 * The whole session as the server wants it. Member ids are participation ids in live mode;
 * unmarked members are omitted. `groupLabel` travels as the group name unless it is the
 * whole-trip label.
 */
public fun HeadcountSession.toSyncRequest(): SyncHeadcountRequestDto = SyncHeadcountRequestDto(
    openedAtDevice = openedAtDevice,
    closedAtDevice = closedAtDevice,
    groupName = groupLabel.takeUnless { it.isBlank() || it == WHOLE_TRIP_LABEL },
    marks = members.mapNotNull { m -> markOf(m.id).wireName()?.let { HeadcountMarkInputDto(m.id, it) } },
)

public const val WHOLE_TRIP_LABEL: String = "Whole trip"

/**
 * Seed a device session from the roster: travelers of `groupName` (or every traveler when null),
 * sorted by name, all unmarked. Leaders and guardians are never counted (ADR-0009 roster rules).
 */
public fun headcountFromRoster(
    id: String,
    roster: List<ParticipationDto>,
    groupName: String?,
    openedBy: String,
    openedAtDevice: String,
): HeadcountSession {
    val members = roster
        .filter { it.role == "traveler" && (groupName == null || it.groupName == groupName) }
        .sortedBy { it.displayName }
        .map { HeadcountMember(id = it.id, name = it.displayName, room = null, lastAckAt = null, windowState = null) }
    return HeadcountSession(
        id = id,
        groupLabel = groupName ?: WHOLE_TRIP_LABEL,
        openedBy = openedBy,
        openedAtDevice = openedAtDevice,
        closedAtDevice = null,
        members = members,
        marks = emptyMap(),
        syncState = SyncState.PENDING,
    )
}

/** Outcome of one push: the (possibly synced) session and why it is or is not synced. */
public data class HeadcountPushResult(
    val session: HeadcountSession,
    /** "synced" | "already-closed" | "rejected:<status>" | "offline" */
    val outcome: String,
    /** Incident card id when the server opened one for this close; null otherwise. */
    val incidentId: String? = null,
)

/**
 * Push the session once. Ok → SYNCED (even when the server kept its own closed copy: the device
 * has nothing more to say). A rejection (403, 409, 404) or no network leaves it PENDING for the
 * next attempt; nothing is lost because the session lives on the device.
 */
public suspend fun pushHeadcount(
    api: ApiClient,
    orgId: String,
    tripId: String,
    session: HeadcountSession,
): HeadcountPushResult =
    when (val r = api.syncHeadcount(orgId, tripId, session.id, session.toSyncRequest())) {
        is ApiResult.Ok -> HeadcountPushResult(session.markSynced(), if (r.value.applied) "synced" else "already-closed", r.value.incidentId)
        is ApiResult.Failed -> HeadcountPushResult(session, "rejected:${r.status}")
        is ApiResult.Unreachable -> HeadcountPushResult(session, "offline")
    }
