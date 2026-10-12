// Copyright 2026- At Day. All rights reserved.
//
// Packing checklist wire types (mirror of packages/contracts/src/packing.ts; D38, slice 048). A
// phone reads its own list (`GET .../packing/mine`: a traveler's or leader's own, a guardian's
// for their traveler) and ticks one item at a time. The organizer's progress view is the console's.

package com.voysemble.core.api

import kotlinx.serialization.Serializable

@Serializable
public data class MyPackingItemDto(
    val id: String,
    val name: String,
    val note: String = "",
    val packed: Boolean,
    val packedAt: String? = null,
)

@Serializable
public data class MyPackingListDto(
    val travelerParticipationId: String,
    val travelerName: String,
    /** self | guardian */
    val packingFor: String,
    val items: List<MyPackingItemDto>,
    val packed: Int,
    val total: Int,
)

@Serializable
public data class SetPackedRequestDto(val packed: Boolean)
