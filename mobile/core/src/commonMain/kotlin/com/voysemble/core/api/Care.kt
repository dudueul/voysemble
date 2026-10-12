// Copyright 2026- At Day. All rights reserved.
//
// Care notes (D27, slice 030) on the wire. The content arrives only from a reveal, which the
// server audits; the device shows it while the screen is open and never stores it.

package com.voysemble.core.api

import kotlinx.serialization.Serializable

@Serializable
public data class CareNoteDto(val allergies: String = "", val medications: String = "", val freeText: String = "")

/** Whether a note is on file and who set it; never the content (D27). */
@Serializable
public data class CareNoteStatusDto(
    val participationId: String,
    val hasCareNote: Boolean,
    val updatedAt: String? = null,
    val updatedByName: String? = null,
    val reveals: Int = 0,
)

/** True when every field is blank: a PUT with it clears the note (same rule as the server). */
public fun CareNoteDto.isBlank(): Boolean = allergies.isBlank() && medications.isBlank() && freeText.isBlank()

@Serializable
public data class RevealCareNoteResponseDto(
    val participationId: String,
    val note: CareNoteDto,
    val updatedAt: String,
    val updatedByName: String,
    val revealedAt: String,
)

/** One line for a row: "Allergies: peanuts · Medications: EpiPen · inhaler in the bag" (same rule as the console). */
public fun careLineOf(note: CareNoteDto): String = listOfNotNull(
    note.allergies.trim().takeIf { it.isNotEmpty() }?.let { "Allergies: $it" },
    note.medications.trim().takeIf { it.isNotEmpty() }?.let { "Medications: $it" },
    note.freeText.trim().takeIf { it.isNotEmpty() },
).joinToString(" · ")
