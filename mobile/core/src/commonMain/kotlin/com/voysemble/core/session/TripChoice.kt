// Copyright 2026- At Day. All rights reserved.
//
// The trips an account is on (slice 067, D42 on the phone). A choice carries what the switch
// shows (the trip and its days, the organization, who the person is on it) and the rule that
// picks one without a choice: the trip on today, else the next to start, else the one that
// ended last; the same rule the console uses. Pure Kotlin; the platforms render it.

package com.voysemble.core.session

import com.voysemble.core.api.MyParticipationDto
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf

public data class TripChoice(
    val trip: ActiveTrip,
    /** ISO days; empty when the server did not say. */
    val startsOn: String,
    val endsOn: String,
    val timezone: String,
    val displayName: String,
    val groupName: String?,
)

/** The account's trips, as the switch lists them. */
public data class TripChoices(val choices: List<TripChoice>)

public fun tripChoiceOf(p: MyParticipationDto): TripChoice = TripChoice(
    trip = ActiveTrip(
        organizationId = p.organizationId,
        organizationName = p.organizationName,
        tripId = p.tripId,
        tripName = p.tripName,
        participationId = p.participation.id,
        role = p.participation.role,
    ),
    startsOn = p.startsOn ?: "",
    endsOn = p.endsOn ?: "",
    timezone = p.timezone ?: "",
    displayName = p.participation.displayName,
    groupName = p.participation.groupName,
)

/** The trip on today, else the next to start, else the one that ended last; null without any. */
public fun defaultChoice(choices: List<TripChoice>, today: String): TripChoice? {
    if (choices.isEmpty()) return null
    choices.firstOrNull { it.startsOn.isNotEmpty() && it.startsOn <= today && today <= it.endsOn }?.let { return it }
    choices.filter { it.startsOn > today }.minByOrNull { it.startsOn }?.let { return it }
    return choices.maxByOrNull { it.endsOn } ?: choices.first()
}

/** "2026-12-26 → 2027-01-07", or nothing when the days are unknown. */
public fun TripChoice.dateLine(): String = if (startsOn.isEmpty()) "" else "$startsOn → $endsOn"

/** "Leader · Bus A" / "인솔자 · Bus A"; the role alone without a group. */
public fun TripChoice.roleLine(): String {
    val role = when (trip.role) {
        "leader" -> tr(Txt.TRIP_ROLE_LEADER)
        "guardian" -> tr(Txt.TRIP_ROLE_GUARDIAN)
        else -> tr(Txt.TRIP_ROLE_TRAVELER)
    }
    return groupName?.let { "$role · $it" } ?: role
}

/** "Switch to Spring Choir Exchange", for the row's accessibility label. */
public fun TripChoice.switchSpoken(): String = trf(Txt.TRIP_SWITCH_SPOKEN, trip.tripName)
