// Copyright 2026- At Day. All rights reserved.
//
// Announcements feed model (D16, ADR-0009). Required-ack announcements are acknowledged locally
// first (PENDING, queued in the outbox) and confirmed by the server later. Machine translation
// travels with the item; the original is always kept and shown first. Pure Kotlin.

package com.voysemble.core.announcements

import com.voysemble.core.today.AckState

public data class AnnouncementItem(
    val id: String,
    val title: String,
    val body: String,
    /** Machine translation of `body` into the reader's language, when the author's differs. */
    val machineTranslation: String?,
    val author: String,
    /** Local HH:mm when published. */
    val publishedAt: String,
    val requiresAck: Boolean,
    val sharedWithGuardians: Boolean,
    val ack: AckState,
    val acknowledgedCount: Int,
    val totalCount: Int,
    /** "ko" | "en" of `machineTranslation`; null when there is none. */
    val translationLocale: String? = null,
    /** Set when a bilingual staff member replaced the machine text (label "edited by"). */
    val translationEditedBy: String? = null,
) {
    /** Label shown above the translation block, in the reader's UI language (EN strings for now). */
    public val translationLabel: String?
        get() = machineTranslation?.let {
            val lang = if (translationLocale == "en") "English" else "한국어"
            if (translationEditedBy != null) "Translation edited by $translationEditedBy · $lang" else "Machine translation · $lang"
        }
}

public data class AnnouncementFeed(
    val items: List<AnnouncementItem>,
    /** Ids whose ack is queued on the device and not yet confirmed; survives restarts in later slices. */
    val outbox: List<String>,
    val offline: Boolean,
) {
    public val unackedRequired: List<AnnouncementItem>
        get() = items.filter { it.requiresAck && it.ack == AckState.UNACKNOWLEDGED }
}

public fun AnnouncementFeed.acknowledge(id: String): AnnouncementFeed {
    val item = items.firstOrNull { it.id == id } ?: return this
    if (!item.requiresAck || item.ack != AckState.UNACKNOWLEDGED) return this
    return copy(
        items = items.map { if (it.id == id) it.copy(ack = AckState.PENDING) else it },
        outbox = outbox + id,
    )
}

public fun AnnouncementFeed.confirm(id: String): AnnouncementFeed {
    val item = items.firstOrNull { it.id == id } ?: return this
    if (item.ack != AckState.PENDING) return this
    return copy(
        items = items.map { if (it.id == id) it.copy(ack = AckState.ACKNOWLEDGED, acknowledgedCount = it.acknowledgedCount + 1) else it },
        outbox = outbox - id,
    )
}
