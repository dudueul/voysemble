// Copyright 2026- At Day. All rights reserved.
//
// Photo wire types (mirror of packages/contracts/src/media.ts; D18, slice 044). The phone reads
// what the server lets it see (ADR-0009), uploads an original and a thumbnail it made itself
// (D34), and a leader clears a flag, builds the album with tags, or removes a photo.

package com.voysemble.core.api

import kotlinx.serialization.Serializable

@Serializable
public data class PhotoAlbumDto(
    val at: String,
    val byName: String,
    val wholeGroup: Boolean,
    val participationIds: List<String> = emptyList(),
    val taggedNames: List<String> = emptyList(),
)

@Serializable
public data class PhotoDto(
    val id: String,
    val tripId: String,
    val uploaderName: String,
    /** owner | organizer | leader | traveler */
    val uploaderRole: String,
    val mine: Boolean,
    /** Trip day (1 = the first day); 0 outside the trip dates. */
    val day: Int,
    val takenAt: String,
    /** image/jpeg | image/png | image/webp */
    val contentType: String,
    val bytes: Long,
    val thumbnailBytes: Long,
    /** pool | flagged | approved */
    val status: String,
    /** nudity | non_member_minor | violence, kept after a clear */
    val flag: String? = null,
    val reviewedByName: String? = null,
    val album: PhotoAlbumDto? = null,
    val uploadedAt: String,
    /** API paths, same host; fetched with the bearer token through `ApiClient.photoBytes`. */
    val thumbnailUrl: String,
    val contentUrl: String,
)

@Serializable
public data class PhotoCountsDto(val pool: Int, val flagged: Int, val approved: Int)

@Serializable
public data class PhotoListDto(val photos: List<PhotoDto>, val counts: PhotoCountsDto)

@Serializable
public data class ReviewPhotoRequestDto(
    /** clear | remove */
    val decision: String,
)

@Serializable
public data class AlbumPhotoRequestDto(val wholeGroup: Boolean = false, val participationIds: List<String> = emptyList())

@Serializable
public data class DeletePhotoResponseDto(val deleted: Boolean, val photoId: String)

/** What a phone sends up: the bytes of the original and of the thumbnail it made, and the type. */
public class PhotoUpload(
    public val original: ByteArray,
    public val thumbnail: ByteArray?,
    /** image/jpeg | image/png | image/webp */
    public val contentType: String,
    /** RFC 3339, or null for "now" on the server. */
    public val takenAt: String?,
)
