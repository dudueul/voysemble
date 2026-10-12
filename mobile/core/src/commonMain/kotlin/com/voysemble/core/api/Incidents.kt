// Copyright 2026- At Day. All rights reserved.
//
// Incident wire types (mirror of packages/contracts/src/incident.ts) and the mapping to the
// device cards. Confirming is one POST; replaying a pending answer appends another confirmation
// on the server, which is acceptable (the trail is append-only and newest wins), so no
// idempotency key is needed yet.

package com.voysemble.core.api

import com.voysemble.core.incidents.ConfirmationStatus
import com.voysemble.core.incidents.IncidentCard
import com.voysemble.core.incidents.IncidentConfirmation
import com.voysemble.core.incidents.IncidentFeed
import com.voysemble.core.incidents.IncidentStatus
import kotlinx.serialization.Serializable

@Serializable
public data class IncidentPersonDto(val participationId: String, val displayName: String, val groupName: String? = null)

@Serializable
public data class IncidentConfirmationDto(
    val id: String,
    /** "with_group" | "not_with_group" | "unknown" */
    val status: String,
    val note: String? = null,
    val confirmedByName: String,
    val confirmedByRole: String,
    val confirmedAt: String,
)

@Serializable
public data class GuardianMessageDto(val bodyEn: String, val bodyKo: String, val sentAt: String, val sentByName: String)

@Serializable
public data class IncidentDto(
    val id: String,
    val tripId: String,
    val kind: String,
    /** "open" | "resolved" */
    val status: String,
    val title: String,
    val headcountId: String? = null,
    val people: List<IncidentPersonDto>,
    val openedAt: String,
    val openedByName: String,
    val resolvedAt: String? = null,
    val resolvedByName: String? = null,
    val resolutionNote: String? = null,
    val confirmations: List<IncidentConfirmationDto> = emptyList(),
    val guardianMessage: GuardianMessageDto? = null,
)

@Serializable
public data class IncidentListDto(val incidents: List<IncidentDto>)

@Serializable
public data class ConfirmIncidentRequestDto(val status: String, val note: String?)

public fun ConfirmationStatus.wireName(): String = when (this) {
    ConfirmationStatus.WITH_GROUP -> "with_group"
    ConfirmationStatus.NOT_WITH_GROUP -> "not_with_group"
    ConfirmationStatus.UNKNOWN -> "unknown"
}

/** The pending local answer as the wire request; one place for the mapping, callable from Swift. */
public fun confirmRequestOf(confirmation: IncidentConfirmation): ConfirmIncidentRequestDto =
    ConfirmIncidentRequestDto(confirmation.status.wireName(), confirmation.note)

public fun confirmationStatusOf(wire: String): ConfirmationStatus = when (wire) {
    "with_group" -> ConfirmationStatus.WITH_GROUP
    "not_with_group" -> ConfirmationStatus.NOT_WITH_GROUP
    else -> ConfirmationStatus.UNKNOWN
}

/** Server rows → device cards. `clock` renders instants as local HH:mm; `locale` picks the guardian text. */
public fun IncidentDto.toCard(clock: (iso: String) -> String, locale: String = "en"): IncidentCard = IncidentCard(
    id = id,
    title = title,
    status = if (status == "resolved") IncidentStatus.RESOLVED else IncidentStatus.OPEN,
    people = people.map { it.displayName },
    openedAt = clock(openedAt),
    openedBy = openedByName,
    confirmations = confirmations.map { IncidentConfirmation(confirmationStatusOf(it.status), it.note, it.confirmedByName, clock(it.confirmedAt)) },
    guardianMessage = guardianMessage?.let { if (locale == "ko") it.bodyKo else it.bodyEn },
)

/**
 * Merge server cards into the device feed, keeping any pending answer the server has not
 * acknowledged yet (same rule as the ack outbox: queued stays queued until replayed).
 */
public fun mergeIncidents(local: IncidentFeed, remote: List<IncidentDto>, clock: (iso: String) -> String, locale: String = "en"): IncidentFeed =
    local.copy(
        cards = remote.map { dto ->
            val card = dto.toCard(clock, locale)
            val pending = local.cards.firstOrNull { it.id == dto.id }?.pending
            if (pending != null && card.isOpen) card.copy(pending = pending) else card
        },
        offline = false,
    )
