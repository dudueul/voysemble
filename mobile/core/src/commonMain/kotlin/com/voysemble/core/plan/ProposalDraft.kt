// Copyright 2026- At Day. All rights reserved.
//
// A leader's change proposal from the phone (D24; slice 018 for edits, slice 035 for add and
// remove on both phones). The draft is what the form holds; one rule says whether it can be
// sent and one call sends it, so Android and iOS cannot drift on the wire shape. The organizer
// decides on the console; nothing here touches the draft itinerary.

package com.voysemble.core.plan

import com.voysemble.core.api.AddEventPatchDto
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
import com.voysemble.core.api.CreateAddProposalRequestDto
import com.voysemble.core.api.CreateProposalRequestDto
import com.voysemble.core.api.ItineraryProposalDto
import com.voysemble.core.api.ProposalPatchDto

public enum class ProposalKind { EDIT, ADD, REMOVE }

/**
 * What the leader proposes. EDIT: a new start (optional) for `eventId`. REMOVE: `eventId`, no
 * patch. ADD: a new event on `date` in `timeZone` at `order` (the day's next slot) with `title`,
 * `start`, optional `end` and `place`. `note` (why) is required for every kind.
 */
public data class ProposalDraft(
    val kind: ProposalKind,
    val eventId: String?,
    val note: String,
    val start: String? = null,
    val end: String? = null,
    val title: String? = null,
    val place: String? = null,
    val date: String? = null,
    val timeZone: String? = null,
    val order: Int = 0,
)

/** HH:mm, 00:00–23:59. */
public fun isValidClock(hhmm: String): Boolean {
    val m = Regex("^([01][0-9]|2[0-3]):[0-5][0-9]$")
    return m.matches(hhmm)
}

/** Null when the draft can be sent; otherwise what is missing, in the leader's words. */
public fun proposalDraftProblem(d: ProposalDraft): String? {
    if (d.note.isBlank()) return "Say why in a line."
    return when (d.kind) {
        ProposalKind.EDIT -> when {
            d.eventId.isNullOrBlank() -> "Pick an event."
            d.start != null && d.start.isNotBlank() && !isValidClock(d.start.trim()) -> "The new start must be HH:mm."
            else -> null
        }
        ProposalKind.REMOVE -> if (d.eventId.isNullOrBlank()) "Pick an event." else null
        ProposalKind.ADD -> when {
            d.title.isNullOrBlank() -> "Give the event a title."
            d.start.isNullOrBlank() || !isValidClock(d.start.trim()) -> "The start must be HH:mm."
            d.end != null && d.end.isNotBlank() && !isValidClock(d.end.trim()) -> "The end must be HH:mm."
            d.date.isNullOrBlank() || d.timeZone.isNullOrBlank() -> "Pick a day."
            else -> null
        }
    }
}

/** The edit or remove body (null for ADD, which has its own shape). Untouched patch fields stay off the wire. */
public fun proposalRequestOf(d: ProposalDraft): CreateProposalRequestDto? = when (d.kind) {
    ProposalKind.EDIT -> CreateProposalRequestDto(
        kind = "edit",
        eventId = d.eventId,
        patch = ProposalPatchDto(start = d.start?.trim()?.takeIf { it.isNotBlank() }),
        note = d.note.trim(),
    )
    ProposalKind.REMOVE -> CreateProposalRequestDto(kind = "remove", eventId = d.eventId, patch = ProposalPatchDto(), note = d.note.trim())
    ProposalKind.ADD -> null
}

/** The add body: a scheduled activity for the whole group, after the day's last event. */
public fun addProposalRequestOf(d: ProposalDraft): CreateAddProposalRequestDto? {
    if (d.kind != ProposalKind.ADD || proposalDraftProblem(d) != null) return null
    return CreateAddProposalRequestDto(
        patch = AddEventPatchDto(
            date = d.date!!,
            start = d.start!!.trim(),
            end = d.end?.trim()?.takeIf { it.isNotBlank() },
            timeZone = d.timeZone!!,
            kind = "activity",
            title = d.title!!.trim(),
            place = d.place?.trim().orEmpty(),
            pax = null,
            status = "scheduled",
            note = null,
            order = d.order,
        ),
        note = d.note.trim(),
    )
}

/**
 * Send a draft that `proposalDraftProblem` accepted. One call for both phones; the view models
 * only map the result to a line on the card. An incomplete draft is a programming error here.
 */
public suspend fun ApiClient.sendProposal(orgId: String, tripId: String, draft: ProposalDraft): ApiResult<ItineraryProposalDto> {
    require(proposalDraftProblem(draft) == null) { "incomplete proposal draft" }
    return when (draft.kind) {
        ProposalKind.ADD -> createAddProposal(orgId, tripId, addProposalRequestOf(draft)!!)
        else -> createProposal(orgId, tripId, proposalRequestOf(draft)!!)
    }
}

public const val PROPOSAL_OFFLINE_MESSAGE: String = "Offline. Try again when connected."

/** The same line as a function, which Swift reads without the constant export. */
public fun proposalOfflineMessage(): String = PROPOSAL_OFFLINE_MESSAGE

/** The line under the button when the server refused: 403 is the one a traveler can hit. */
public fun proposalFailureMessage(status: Int, code: String): String =
    if (status == 403) "Only trip leaders propose changes." else "Could not send the proposal ($code)."

/** What the card says after a successful send, per kind. */
public fun proposalSentMessage(kind: ProposalKind): String = when (kind) {
    ProposalKind.EDIT -> "Proposal sent to the organizer"
    ProposalKind.REMOVE -> "Removal proposed to the organizer"
    ProposalKind.ADD -> "New event proposed to the organizer"
}
