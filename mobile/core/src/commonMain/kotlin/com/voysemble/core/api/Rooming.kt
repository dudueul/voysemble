// Copyright 2026- At Day. All rights reserved.
//
// Rooming list wire types (mirror of packages/contracts/src/travel.ts, the RoomingList part; D41,
// slice 059). A leader's phone reads a hotel's rooming list (`GET .../travel/{bookingId}/rooming`);
// the organizer places people on the console; travelers and guardians never call this (D13).

package com.voysemble.core.api

import kotlinx.serialization.Serializable

@Serializable
public data class RoomAssignmentDto(
    val participationId: String,
    val displayName: String,
    /** leader | traveler */
    val role: String,
    val groupName: String? = null,
    val room: String? = null,
)

@Serializable
public data class RoomingHotelDto(
    val id: String,
    val name: String,
    val city: String,
    val checkIn: String,
    val checkOut: String,
    val rooms: Int = 0,
)

@Serializable
public data class RoomingListDto(
    val hotel: RoomingHotelDto,
    /** Leaders first, then travelers by group and name. */
    val people: List<RoomAssignmentDto>,
    val roomsUsed: Int = 0,
    val assigned: Int = 0,
)
