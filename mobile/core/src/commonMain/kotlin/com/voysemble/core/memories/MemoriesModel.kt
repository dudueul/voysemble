// Copyright 2026- At Day. All rights reserved.
//
// Memories tab model shared by Android and iOS (D18, slice 044): the photos as the server lets
// this participant see them, grouped into the pool, the review queue (leaders) and the album
// (guardians see only that), the labels, and who may do what. Pure Kotlin: no I/O; the platform
// fetches bytes and makes thumbnails.

package com.voysemble.core.memories

import com.voysemble.core.api.PhotoDto
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf

public data class Memory(
    val id: String,
    val uploaderName: String,
    val mine: Boolean,
    /** 0 outside the trip dates. */
    val day: Int,
    /** pool | flagged | approved */
    val status: String,
    /** nudity | non_member_minor | violence, while flagged */
    val flag: String?,
    /** Names the leader tagged; "whole group" is `wholeGroup`. */
    val taggedNames: List<String>,
    val wholeGroup: Boolean,
    /** API path of the thumbnail; the platform fetches it with the client. */
    val thumbnailPath: String,
    val contentPath: String,
)

public data class MemoriesFeed(
    val photos: List<Memory>,
    val offline: Boolean = false,
    /** Photos sent from this device and not yet confirmed. */
    val uploading: Int = 0,
)

public fun PhotoDto.toMemory(): Memory = Memory(
    id = id,
    uploaderName = uploaderName,
    mine = mine,
    day = day,
    status = status,
    flag = if (status == "flagged") flag else null,
    taggedNames = album?.taggedNames ?: emptyList(),
    wholeGroup = album?.wholeGroup ?: false,
    thumbnailPath = thumbnailUrl,
    contentPath = contentUrl,
)

/** The review queue: flagged photos a leader decides on. (Functions, not properties: Swift sees members.) */
public fun MemoriesFeed.queue(): List<Memory> = photos.filter { it.status == "flagged" }

/** The pool: everything that is not waiting for review. */
public fun MemoriesFeed.pool(): List<Memory> = photos.filter { it.status != "flagged" }

/** The album: approved photos (what guardians see). */
public fun MemoriesFeed.album(): List<Memory> = photos.filter { it.status == "approved" }

/** Leaders review, build the album and may delete; travelers upload and delete their own; guardians look. */
public fun canReviewPhotos(role: String?): Boolean = role == null || role == "leader"
public fun canUploadPhotos(role: String?): Boolean = role != "guardian"
public fun Memory.canDelete(role: String?): Boolean = mine || role == null || role == "leader"

/** "Minji Park · Day 4", or "· Outside the trip dates" when the day is unknown. */
public fun Memory.caption(): String =
    "$uploaderName · " + (if (day > 0) trf(Txt.MEM_DAY, day) else tr(Txt.MEM_DAY_OUTSIDE))

/** "Whole group · Minji Park", the names alone, or the group alone. */
public fun Memory.albumLabel(): String {
    val names = taggedNames.joinToString(", ")
    return when {
        wholeGroup && names.isNotEmpty() -> "${tr(Txt.MEM_WHOLE_GROUP)} · $names"
        wholeGroup -> tr(Txt.MEM_WHOLE_GROUP)
        else -> names
    }
}

public fun flagLabel(flag: String?): String = when (flag) {
    "nudity" -> tr(Txt.MEM_FLAG_NUDITY)
    "violence" -> tr(Txt.MEM_FLAG_VIOLENCE)
    "non_member_minor" -> tr(Txt.MEM_FLAG_MINOR)
    else -> tr(Txt.MEM_FLAG_OTHER)
}

/** The tab's one-line summary for a participant: pool, album, and the queue for leaders. */
public fun MemoriesFeed.summary(role: String?): String = when {
    role == "guardian" -> trf(Txt.MEM_SUMMARY_GUARDIAN, album().size)
    canReviewPhotos(role) -> trf(Txt.MEM_SUMMARY_LEADER, pool().size, album().size, queue().size)
    else -> trf(Txt.MEM_SUMMARY, pool().size, album().size)
}

public fun MemoriesFeed.withOffline(offline: Boolean): MemoriesFeed = copy(offline = offline)
public fun MemoriesFeed.replace(photos: List<Memory>): MemoriesFeed = copy(photos = photos, offline = false)
public fun MemoriesFeed.without(photoId: String): MemoriesFeed = copy(photos = photos.filter { it.id != photoId })
public fun MemoriesFeed.upsert(photo: Memory): MemoriesFeed =
    copy(photos = if (photos.any { it.id == photo.id }) photos.map { if (it.id == photo.id) photo else it } else listOf(photo) + photos)
