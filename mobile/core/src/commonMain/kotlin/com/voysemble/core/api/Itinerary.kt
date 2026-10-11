// Copyright 2026- At Day. All rights reserved.
//
// Itinerary wire types (mirror of packages/contracts/src/itinerary.ts). The phone reads the
// latest published revision (D24: read-only on mobile, single writer on the console) and builds
// the Today snapshot from the events of the device's calendar date in the trip's zone.

package com.voysemble.core.api

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable

@Serializable
public data class ItineraryEventDto(
    val id: String,
    val tripId: String,
    val date: String,
    val start: String,
    val end: String? = null,
    val timeZone: String,
    /** flight | bus | meal | activity | hotel | meeting | free */
    val kind: String,
    val title: String,
    val place: String,
    val pax: Int? = null,
    /** scheduled | in_progress | done | delayed | cancelled */
    val status: String,
    val note: String? = null,
    val order: Int,
    val published: Boolean,
)

@Serializable
public data class ItineraryDayDto(val date: String, val timeZone: String, val label: String)

@Serializable
public data class ItineraryDto(
    val tripId: String,
    val tripName: String,
    val startDate: String,
    val endDate: String,
    val revision: Int,
    val publishedAt: String? = null,
    /** draft | published */
    val view: String,
    val days: List<ItineraryDayDto>,
    val events: List<ItineraryEventDto>,
    val unpublished: Int,
)

/* ---------- Leader change proposals (D24, slice 018) ---------- */

/**
 * The leader's patch. Only the fields the leader set travel: the client encodes nulls and defaults
 * elsewhere (ApiClient's Json config), so these fields opt out with `EncodeDefault.Mode.NEVER`;
 * an untouched field is absent on the wire, which the server reads as "unchanged". Clearing
 * `end` or `note` from the phone is therefore not possible this slice (the console can).
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
public data class ProposalPatchDto(
    @EncodeDefault(EncodeDefault.Mode.NEVER) val start: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val end: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val title: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val place: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val note: String? = null,
)

@Serializable
public data class CreateProposalRequestDto(
    /** edit | add | remove */
    val kind: String,
    val eventId: String?,
    val patch: ProposalPatchDto,
    val note: String,
)

@Serializable
public data class ItineraryProposalDto(
    val id: String,
    val tripId: String,
    val kind: String,
    val eventId: String? = null,
    val eventTitle: String? = null,
    val note: String,
    /** pending | accepted | rejected */
    val status: String,
    val proposedByName: String,
    val proposedAt: String,
    val decidedAt: String? = null,
    val decidedByName: String? = null,
    val decisionNote: String? = null,
)
