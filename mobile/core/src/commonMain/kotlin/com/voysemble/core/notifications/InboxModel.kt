// Copyright 2026- At Day. All rights reserved.
//
// The notification inbox on the phone (D29, slice 053): what the lanes delivered to this
// participant, shared by Android and iOS. Pure Kotlin: the wire list becomes `Inbox`, a read
// flips one row locally before the server confirms, the summary counts the unread, and the lane
// and kind have their names in the app's language. The platform supplies the clock that turns a
// delivery instant into a label ("06:52" today, "12-30 21:05" before), as the chat does.
// Functions rather than properties where Swift must see members.

package com.voysemble.core.notifications

import com.voysemble.core.api.MyNotificationsDto
import com.voysemble.core.api.NotificationDto
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf

/** The three lanes of D29; the server decided which one, the phone only names it. */
public enum class Lane { PRIORITY, NORMAL, DIGEST }

public enum class InboxKind { ANNOUNCEMENT, ITINERARY_REVISION, HEADCOUNT_CALL, INCIDENT_STATUS, PROPOSAL_DECIDED, PACKING_REMINDER, DOCUMENT_REMINDER }

public data class InboxItem(
    val id: String,
    val lane: Lane,
    val kind: InboxKind,
    val title: String,
    val body: String,
    /** What it points at: announcement | headcount | incident | proposal, and its id. */
    val refType: String,
    val refId: String,
    /** The delivery instant (ISO) and its label on this phone. */
    val deliveredAtIso: String,
    val deliveredAt: String,
    val read: Boolean,
)

public data class Inbox(
    /** Newest first, as the server sends them. */
    val items: List<InboxItem>,
    val offline: Boolean = false,
)

/** "priority" → PRIORITY; anything unknown reads as the normal lane. */
public fun laneOf(wire: String): Lane = when (wire) {
    "priority" -> Lane.PRIORITY
    "digest" -> Lane.DIGEST
    else -> Lane.NORMAL
}

/** "headcount_call" → HEADCOUNT_CALL; anything unknown reads as an announcement. */
public fun kindOf(wire: String): InboxKind = when (wire) {
    "itinerary_revision" -> InboxKind.ITINERARY_REVISION
    "headcount_call" -> InboxKind.HEADCOUNT_CALL
    "incident_status" -> InboxKind.INCIDENT_STATUS
    "proposal_decided" -> InboxKind.PROPOSAL_DECIDED
    "packing_reminder" -> InboxKind.PACKING_REMINDER
    "document_reminder" -> InboxKind.DOCUMENT_REMINDER
    else -> InboxKind.ANNOUNCEMENT
}

public fun inboxItemOf(dto: NotificationDto, clock: (iso: String) -> String): InboxItem = InboxItem(
    id = dto.id,
    lane = laneOf(dto.lane),
    kind = kindOf(dto.kind),
    title = dto.title,
    body = dto.body,
    refType = dto.refType,
    refId = dto.refId,
    deliveredAtIso = dto.deliverAt,
    deliveredAt = clock(dto.deliverAt),
    read = dto.readAt != null,
)

public fun inboxOf(dto: MyNotificationsDto, clock: (iso: String) -> String): Inbox =
    Inbox(items = dto.notifications.map { inboxItemOf(it, clock) })

public fun emptyInbox(): Inbox = Inbox(emptyList())

public fun Inbox.withOffline(offline: Boolean): Inbox = copy(offline = offline)

/** The same inbox with one row read (the optimistic flip; the server's row replaces it). */
public fun Inbox.withRead(id: String): Inbox = copy(items = items.map { if (it.id == id) it.copy(read = true) else it })

public fun Inbox.replaceItem(item: InboxItem): Inbox = copy(items = items.map { if (it.id == item.id) item else it })

public fun Inbox.unreadCount(): Int = items.count { !it.read }

/** "2 unread", "All read" or "Nothing yet". */
public fun Inbox.summary(): String = when {
    items.isEmpty() -> tr(Txt.INBOX_NONE_SHORT)
    unreadCount() == 0 -> tr(Txt.INBOX_ALL_READ)
    else -> trf(Txt.INBOX_UNREAD, unreadCount())
}

public fun laneLabel(lane: Lane): String = when (lane) {
    Lane.PRIORITY -> tr(Txt.INBOX_LANE_PRIORITY)
    Lane.NORMAL -> tr(Txt.INBOX_LANE_NORMAL)
    Lane.DIGEST -> tr(Txt.INBOX_LANE_DIGEST)
}

public fun kindLabel(kind: InboxKind): String = when (kind) {
    InboxKind.ANNOUNCEMENT -> tr(Txt.INBOX_KIND_ANNOUNCEMENT)
    InboxKind.ITINERARY_REVISION -> tr(Txt.INBOX_KIND_REVISION)
    InboxKind.HEADCOUNT_CALL -> tr(Txt.INBOX_KIND_HEADCOUNT)
    InboxKind.INCIDENT_STATUS -> tr(Txt.INBOX_KIND_INCIDENT)
    InboxKind.PROPOSAL_DECIDED -> tr(Txt.INBOX_KIND_PROPOSAL)
    InboxKind.PACKING_REMINDER -> tr(Txt.INBOX_KIND_PACKING)
    InboxKind.DOCUMENT_REMINDER -> tr(Txt.INBOX_KIND_DOCUMENT)
}

/** "Priority · Head count · 06:52": the row's meta line. */
public fun InboxItem.meta(): String = "${laneLabel(lane)} · ${kindLabel(kind)} · $deliveredAt"

/** What a screen reader says for the row: the title and whether it is read. */
public fun InboxItem.spoken(): String = if (read) trf(Txt.INBOX_READ_SPOKEN, title) else trf(Txt.INBOX_UNREAD_SPOKEN, title)

/** The bell's label: "Inbox, 2 unread". */
public fun bellSpoken(unread: Int): String = trf(Txt.INBOX_BELL_SPOKEN, unread)
