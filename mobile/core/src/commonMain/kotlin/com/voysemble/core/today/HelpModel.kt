// Copyright 2026- At Day. All rights reserved.
//
// The traveler's "I need help" card on Today (D17, slice 074), shared by Android and iOS: the
// request is an incident card of kind `help` naming only the traveler (POST .../incidents), and
// the card the phone shows is the latest card the server lists for them (their own, projected).
// Pure rules over the wire shapes; the apps render and carry the words.

package com.voysemble.core.today

import com.voysemble.core.api.IncidentDto
import com.voysemble.core.api.OpenIncidentRequestDto

public enum class HelpStatus { OPEN, RESOLVED }

public data class HelpCard(
    val id: String,
    /** The traveler's own words, or the default title when they sent none. */
    val title: String,
    val status: HelpStatus,
    /** Local HH:mm when asked. */
    val openedAt: String,
    /** Local HH:mm when resolved; null while open. */
    val resolvedAt: String?,
)

/**
 * The traveler's card: the first card naming them in the server's order (open first, newest
 * first), so an open request shows until it is resolved and the last resolved one after that.
 * Null when nothing names them.
 */
public fun helpCardOf(incidents: List<IncidentDto>, me: String, clock: (iso: String) -> String): HelpCard? =
    incidents.firstOrNull { card -> card.people.any { it.participationId == me } }?.let { card ->
        HelpCard(
            id = card.id,
            title = card.title,
            status = if (card.status == "resolved") HelpStatus.RESOLVED else HelpStatus.OPEN,
            openedAt = clock(card.openedAt),
            resolvedAt = card.resolvedAt?.let(clock),
        )
    }

/** The request: the traveler's words trimmed to the title's length, or the default when blank; themselves alone. */
public fun helpRequestOf(text: String, me: String, defaultTitle: String): OpenIncidentRequestDto =
    OpenIncidentRequestDto(text.trim().take(160).ifBlank { defaultTitle }, listOf(me))
