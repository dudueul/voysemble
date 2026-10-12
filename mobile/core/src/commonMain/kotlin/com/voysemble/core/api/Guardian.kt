// Copyright 2026- At Day. All rights reserved.
//
// Wire shape of the guardian's status (D13, slice 025): `GET .../guardian/status`. Status, never
// coordinates. Nullable fields carry `= null` so an absent key still decodes (wire rules in
// ApiClient).

package com.voysemble.core.api

import kotlinx.serialization.Serializable

@Serializable
public data class GuardianTravelerDto(val participationId: String, val displayName: String, val groupName: String? = null)

@Serializable
public data class GuardianCountDto(
    /** not_counted | present | missing | with_other_group | excused */
    val status: String,
    val headcountId: String? = null,
    val groupLabel: String? = null,
    val closed: Boolean,
    /** The leader's device clock HH:mm at close (or open while open). */
    val atDevice: String? = null,
    val byName: String? = null,
    val receivedAt: String? = null,
)

@Serializable
public data class GuardianIncidentDto(
    val id: String,
    /** open | resolved */
    val status: String,
    val openedAt: String,
    val message: GuardianMessageDto? = null,
)

@Serializable
public data class GuardianStatusDto(
    val traveler: GuardianTravelerDto,
    val count: GuardianCountDto,
    val incident: GuardianIncidentDto? = null,
    val itineraryRevision: Int,
)
