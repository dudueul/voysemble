// Copyright 2026- At Day. All rights reserved.
//
// Itinerary wire types (mirror of packages/contracts/src/itinerary.ts). The phone reads the
// latest published revision (D24: read-only on mobile, single writer on the console) and builds
// the Today snapshot from the events of the device's calendar date in the trip's zone.

package com.voysemble.core.api

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
