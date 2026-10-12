// Copyright 2026- At Day. All rights reserved.
//
// Wire shapes of meeting windows (D15, slice 029). The meeting point (`center`) is present only
// while the window is open and only for members who may share; a device never sends a position,
// only the state it judged. Nullable fields carry `= null` so an absent key still decodes.

package com.voysemble.core.api

import kotlinx.serialization.Serializable

@Serializable
public data class GeoPointDto(val lat: Double, val lng: Double)

@Serializable
public data class WindowMemberDto(
    val participationId: String,
    val displayName: String,
    val groupName: String? = null,
    /** opted_out | inside | outside | uncertain | stale */
    val state: String,
    val reportedAt: String? = null,
)

@Serializable
public data class WindowCountsDto(val inside: Int, val outside: Int, val uncertain: Int, val stale: Int, val optedOut: Int, val total: Int)

@Serializable
public data class MeetingWindowDto(
    val id: String,
    val tripId: String,
    val label: String,
    val place: String,
    val radiusMeters: Int,
    val startsAt: String,
    val endsAt: String,
    val groups: List<String>,
    val openedByName: String,
    val openedAt: String,
    val closedAt: String? = null,
    /** scheduled | open | closed */
    val status: String,
    val center: GeoPointDto? = null,
    val members: List<WindowMemberDto>,
    val counts: WindowCountsDto,
)

@Serializable
public data class WindowListDto(val windows: List<MeetingWindowDto>)

@Serializable
public data class OpenWindowRequestDto(
    val label: String,
    val place: String,
    val radiusMeters: Int,
    val startsAt: String,
    val endsAt: String,
    val groups: List<String>,
    val center: GeoPointDto,
)

@Serializable
public data class ReportWindowStateRequestDto(
    /** opted_out | inside | outside | uncertain */
    val state: String,
)

@Serializable
public data class ReportWindowStateResponseDto(val state: String, val reportedAt: String? = null, val windowStatus: String)
