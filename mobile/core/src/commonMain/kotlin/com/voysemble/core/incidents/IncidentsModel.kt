// Copyright 2026- At Day. All rights reserved.
//
// Incident cards as the leader's phone sees them (D17, D25). A card is opened by the server
// (head count closed with missing travelers) or by the organizer; the leader answers what they
// see right now. The answer is sent immediately when online; a failed send is kept locally as
// PENDING and retried, like an ack. Pure Kotlin, no I/O.

package com.voysemble.core.incidents

import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr

public enum class ConfirmationStatus { WITH_GROUP, NOT_WITH_GROUP, UNKNOWN }

public enum class IncidentStatus { OPEN, RESOLVED }

/** Slice 079: where a card came from (`kind` on the wire): a head count, a hand (the organizer's or a leader's), or the traveler's own request. */
public enum class IncidentKind { HEADCOUNT, MANUAL, HELP }

public data class IncidentConfirmation(
    val status: ConfirmationStatus,
    val note: String?,
    val byName: String,
    /** Local HH:mm as the UI shows it. */
    val at: String,
)

public data class IncidentCard(
    val id: String,
    val title: String,
    val status: IncidentStatus,
    val people: List<String>,
    /** Local HH:mm when the card opened. */
    val openedAt: String,
    val openedBy: String,
    /** Newest first. */
    val confirmations: List<IncidentConfirmation>,
    /** The guardian status message, once the organizer sent it (reader's language picked by the caller). */
    val guardianMessage: String?,
    /** A confirmation the device recorded but the server has not acknowledged yet. */
    val pending: IncidentConfirmation? = null,
    /** Slice 079: the card's origin; a leader reads "Asked for help" at a glance. */
    val kind: IncidentKind = IncidentKind.MANUAL,
) {
    public val latest: IncidentConfirmation? get() = pending ?: confirmations.firstOrNull()
    public val isOpen: Boolean get() = status == IncidentStatus.OPEN
}

public data class IncidentFeed(val cards: List<IncidentCard>, val offline: Boolean)

/** Record the leader's answer locally first; the sync step replays it. */
public fun IncidentFeed.confirmLocally(id: String, status: ConfirmationStatus, note: String?, byName: String, atDevice: String): IncidentFeed =
    copy(cards = cards.map { c -> if (c.id == id && c.isOpen) c.copy(pending = IncidentConfirmation(status, note, byName, atDevice)) else c })

/** The server accepted the pending answer: it is now part of the trail. */
public fun IncidentFeed.confirmed(id: String): IncidentFeed =
    copy(cards = cards.map { c ->
        val p = c.pending
        if (c.id == id && p != null) c.copy(pending = null, confirmations = listOf(p) + c.confirmations) else c
    })

public fun labelOf(status: ConfirmationStatus): String = when (status) {
    ConfirmationStatus.WITH_GROUP -> tr(Txt.CONF_WITH_GROUP)
    ConfirmationStatus.NOT_WITH_GROUP -> tr(Txt.CONF_NOT_WITH_GROUP)
    ConfirmationStatus.UNKNOWN -> tr(Txt.CONF_UNKNOWN)
}

/** Slice 079: the kind as the card's chip reads it, in the reader's language. */
public fun labelOfKind(kind: IncidentKind): String = when (kind) {
    IncidentKind.HEADCOUNT -> tr(Txt.INC_KIND_HEADCOUNT)
    IncidentKind.MANUAL -> tr(Txt.INC_KIND_MANUAL)
    IncidentKind.HELP -> tr(Txt.INC_KIND_HELP)
}

/** The wire kind to the device's: `headcount_missing`, `manual`, `help` (anything unknown reads as by hand). */
public fun incidentKindOf(wire: String): IncidentKind = when (wire) {
    "headcount_missing" -> IncidentKind.HEADCOUNT
    "help" -> IncidentKind.HELP
    else -> IncidentKind.MANUAL
}
