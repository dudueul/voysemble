// Copyright 2026- At Day. All rights reserved.
//
// Announcement wire types (mirror of packages/contracts/src/announcement.ts) and the sync step
// that turns server rows into the on-device AnnouncementFeed and replays the ack outbox.
// Idempotency is server-side per (announcement, participation), so replaying is always safe.

package com.voysemble.core.api

import com.voysemble.core.announcements.AnnouncementFeed
import com.voysemble.core.announcements.AnnouncementItem
import com.voysemble.core.announcements.confirm
import com.voysemble.core.today.AckState
import kotlinx.serialization.Serializable

@Serializable
public data class AnnouncementDto(
    val id: String,
    val tripId: String,
    val title: String,
    val body: String,
    val requiresAck: Boolean,
    val sharedWithGuardians: Boolean,
    val authorName: String,
    val publishedAt: String,
    val ackTotal: Int,
    val ackCount: Int,
    /** "unacknowledged" | "acknowledged" */
    val myAck: String,
    /** Server-side KO<->EN translation (slice 015); null when none exists. */
    val translation: AnnouncementTranslationDto? = null,
    /** "announcement" | "itinerary_revision" (slice 020). */
    val kind: String = "announcement",
    /** The diff behind an itinerary_revision announcement; null otherwise. */
    val revision: RevisionSummaryDto? = null,
)

@Serializable
public data class RevisionChangeDto(
    /** added | changed | removed */
    val kind: String,
    val eventId: String,
    val date: String,
    val day: Int,
    val title: String,
    val start: String,
    val fields: List<String> = emptyList(),
    val previousStart: String? = null,
)

@Serializable
public data class RevisionSummaryDto(
    val revision: Int,
    val fromRevision: Int,
    val added: Int,
    val changed: Int,
    val removed: Int,
    val changes: List<RevisionChangeDto> = emptyList(),
)

/** Same wording as the console: "Day 4 · Colosseum · 09:00 → 08:30". */
public fun changeLinesOf(summary: RevisionSummaryDto): List<String> = summary.changes.map { c ->
    val head = "Day ${c.day} · ${c.title}"
    when (c.kind) {
        "added" -> "$head · added ${c.start}"
        "removed" -> "$head · removed"
        else -> if (c.previousStart != null) "$head · ${c.previousStart} → ${c.start}" else "$head · ${c.fields.joinToString(", ")} changed"
    }
}

@Serializable
public data class AnnouncementTranslationDto(
    /** "ko" | "en" */
    val locale: String,
    val body: String,
    /** "machine" | "edited" */
    val provider: String,
    val editedBy: String? = null,
)

@Serializable
public data class AnnouncementListDto(val announcements: List<AnnouncementDto>)

@Serializable
public data class AckRequestDto(val ackedAtDevice: String)

@Serializable
public data class AckResponseDto(
    val announcementId: String,
    val participationId: String,
    val created: Boolean,
    val ackedAtDevice: String,
    val receivedAt: String,
)

/**
 * Merge server rows into the device feed. Items the device has queued (outbox) stay PENDING even
 * if the server has not seen them yet; items the server reports as acknowledged are confirmed.
 * `clock` renders the published instant as the local HH:mm the UI shows; no I/O here.
 */
public fun mergeAnnouncements(
    local: AnnouncementFeed,
    remote: List<AnnouncementDto>,
    clock: (iso: String) -> String,
): AnnouncementFeed {
    val items = remote.map { dto ->
        val ack = when {
            dto.myAck == "acknowledged" -> AckState.ACKNOWLEDGED
            dto.id in local.outbox -> AckState.PENDING
            else -> AckState.UNACKNOWLEDGED
        }
        AnnouncementItem(
            id = dto.id,
            title = dto.title,
            body = dto.body,
            machineTranslation = dto.translation?.body,
            translationLocale = dto.translation?.locale,
            translationEditedBy = dto.translation?.takeIf { it.provider == "edited" }?.editedBy,
            kind = dto.kind,
            revisionNumber = dto.revision?.revision,
            changeLines = dto.revision?.let { changeLinesOf(it) } ?: emptyList(),
            author = dto.authorName,
            publishedAt = clock(dto.publishedAt),
            requiresAck = dto.requiresAck,
            sharedWithGuardians = dto.sharedWithGuardians,
            ack = ack,
            acknowledgedCount = dto.ackCount,
            totalCount = dto.ackTotal,
        )
    }
    // Drop outbox entries the server already holds; keep the rest for the next replay.
    val outbox = local.outbox.filter { id -> items.any { it.id == id && it.ack == AckState.PENDING } }
    return local.copy(items = items, outbox = outbox)
}

/** Result of one outbox replay: confirmed ids and ids still waiting (offline or server error). */
public data class ReplayResult(val feed: AnnouncementFeed, val confirmed: List<String>, val remaining: List<String>)

/** Replays every queued ack through `send`; a non-Ok answer leaves that id in the outbox. */
public suspend fun replayAckOutbox(
    feed: AnnouncementFeed,
    ackedAtDevice: (announcementId: String) -> String,
    send: suspend (announcementId: String, ackedAtDevice: String) -> ApiResult<AckResponseDto>,
): ReplayResult {
    var current = feed
    val confirmed = mutableListOf<String>()
    val remaining = mutableListOf<String>()
    for (id in feed.outbox) {
        when (send(id, ackedAtDevice(id))) {
            is ApiResult.Ok -> {
                current = current.confirm(id)
                confirmed += id
            }
            is ApiResult.Failed, is ApiResult.Unreachable -> remaining += id
        }
    }
    return ReplayResult(current, confirmed, remaining)
}
