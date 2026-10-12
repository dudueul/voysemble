// Copyright 2026- At Day. All rights reserved.
//
// Travel booking wire types (mirror of packages/contracts/src/travel.ts; D37, slice 047). A
// leader's phone reads the plan; the server answers the bus without the driver's contact (null),
// which never leaves the console. Travelers and guardians never call this: the itinerary carries
// what they need. The phone never writes a booking.

package com.voysemble.core.api

import kotlinx.serialization.Serializable

@Serializable
public data class FlightDto(
    val id: String,
    val tripId: String,
    val kind: String = "flight",
    val code: String,
    val from: String,
    val to: String,
    /** Wall-clock at the place, YYYY-MM-DDTHH:mm. */
    val departsAt: String,
    val arrivesAt: String,
    val pax: Int = 0,
    val pnr: String = "",
    /** scheduled | delayed | done | cancelled */
    val status: String = "scheduled",
    val createdAt: String,
)

@Serializable
public data class HotelDto(
    val id: String,
    val tripId: String,
    val kind: String = "hotel",
    val name: String,
    val city: String,
    /** Calendar dates. */
    val checkIn: String,
    val checkOut: String,
    val rooms: Int = 0,
    val confirmation: String = "",
    val nights: Int,
    val createdAt: String,
)

@Serializable
public data class BusDto(
    val id: String,
    val tripId: String,
    val kind: String = "bus",
    val label: String,
    val company: String,
    val seats: Int,
    /** Null on a leader's phone (D37). */
    val driverContact: String? = null,
    /** Roster group names that ride this bus. */
    val groups: List<String> = emptyList(),
    /** Travelers and leaders of the roster in those groups. */
    val assigned: Int,
    val createdAt: String,
)

@Serializable
public data class TravelPlanDto(
    val flights: List<FlightDto>,
    val hotels: List<HotelDto>,
    val buses: List<BusDto>,
    val groups: List<String> = emptyList(),
    val travelers: Int = 0,
)
