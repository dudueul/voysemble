// Copyright 2026- At Day. All rights reserved.
// Memories tab state holder (D18, slice 044). Live with a client and a trip: the photos the
// server lets this participant see, their thumbnails fetched with the bearer token and decoded
// here, uploads from the photo picker (the thumbnail is made on the device, D34), a leader's
// decisions (approve, remove, album with the whole group) and the uploader's delete. Without a
// trip the fixture (sample mode, leader view). Rules in core (memories/MemoriesModel.kt). The
// Android-only bits (decoding, re-encoding) are injected so the plain JVM tests never touch graphics.

package com.voysemble.app.memories

import androidx.compose.ui.graphics.ImageBitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voysemble.core.api.AlbumPhotoRequestDto
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
import com.voysemble.core.api.PhotoUpload
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
import com.voysemble.core.memories.MemoriesFeed
import com.voysemble.core.memories.replace
import com.voysemble.core.memories.toMemory
import com.voysemble.core.memories.upsert
import com.voysemble.core.memories.withOffline
import com.voysemble.core.memories.without
import com.voysemble.core.session.ActiveTrip
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant

/** One picked image: its bytes as the picker handed them over, and the time if known. */
class PickedImage(val bytes: ByteArray, val takenAt: String?)

data class MemoriesUiState(
    val feed: MemoriesFeed,
    val live: Boolean = false,
    val syncing: Boolean = false,
    val error: String? = null,
    /** A short line after an upload or a decision ("2 uploaded.", "Offline…"). */
    val notice: String? = null,
    /** traveler | leader | guardian; null in sample mode (the leader view). */
    val role: String? = null,
    /** Decoded thumbnails by photo id; a missing key is still loading, null failed. */
    val thumbnails: Map<String, ImageBitmap?> = emptyMap(),
)

class MemoriesViewModel(
    initial: MemoriesFeed = KoreaConcertTourFixture.memories(),
    private val api: ApiClient? = null,
    private val trip: ActiveTrip? = null,
    /** Sample mode only: the role whose view to show (null = leader). */
    sampleRole: String? = null,
    /** A picked image to its two JPEG renditions (D34); null when undecodable. */
    private val prepare: (ByteArray) -> PreparedImage? = { AndroidImages.prepare(it) },
    private val decode: (ByteArray) -> ImageBitmap? = { AndroidImages.decode(it) },
    private val nowIso: () -> String = { Instant.now().toString() },
) : ViewModel() {
    private val live = api != null && trip != null
    private val _state = MutableStateFlow(
        MemoriesUiState(
            feed = if (live) MemoriesFeed(emptyList()) else initial,
            live = live,
            role = trip?.role ?: sampleRole,
        ),
    )
    val state: StateFlow<MemoriesUiState> = _state

    /** The first list (live); completed at once in sample mode. Tests await it. */
    val ready: Job = if (live) refresh() else Job().also { it.complete() }

    fun refresh(): Job {
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        _state.update { it.copy(syncing = true) }
        return viewModelScope.launch {
            when (val r = a.listPhotos(t.organizationId, t.tripId)) {
                is ApiResult.Ok -> {
                    val photos = r.value.photos.map { it.toMemory() }
                    _state.update { it.copy(feed = it.feed.replace(photos), syncing = false, error = null) }
                    for (p in photos) if (!_state.value.thumbnails.containsKey(p.id)) loadThumbnail(p.id, p.thumbnailPath)
                }
                is ApiResult.Failed -> _state.update {
                    it.copy(syncing = false, error = if (r.status == 403) tr(Txt.MEM_REFUSED) else trf(Txt.MEM_LOAD_FAILED, r.error.code))
                }
                is ApiResult.Unreachable -> _state.update { it.copy(feed = it.feed.withOffline(true), syncing = false, error = tr(Txt.MEM_OFFLINE)) }
            }
        }
    }

    private suspend fun loadThumbnail(id: String, path: String) {
        val a = api ?: return
        val bitmap = (a.photoBytes(path) as? ApiResult.Ok)?.value?.let(decode)
        _state.update { it.copy(thumbnails = it.thumbnails + (id to bitmap)) }
    }

    /** Each picked image goes up with a thumbnail made here; the feed gains each one as it lands. */
    fun upload(images: List<PickedImage>): Job {
        val a = api
        val t = trip
        if (a == null || t == null) {
            _state.update { it.copy(notice = trf(Txt.MEM_UPLOADED, images.size)) }
            return Job().also { it.complete() }
        }
        _state.update { it.copy(notice = trf(Txt.MEM_UPLOADING, images.size), feed = it.feed.copy(uploading = images.size)) }
        return viewModelScope.launch {
            var done = 0
            var failure: String? = null
            for (img in images) {
                // Undecodable bytes go up as they are: the server reads the type from the bytes and refuses junk.
                val prepared = prepare(img.bytes)
                val upload = prepared?.let { PhotoUpload(it.original, it.thumbnail, it.contentType, img.takenAt ?: nowIso()) }
                    ?: PhotoUpload(img.bytes, null, "image/jpeg", img.takenAt ?: nowIso())
                when (val r = a.uploadPhoto(t.organizationId, t.tripId, upload)) {
                    is ApiResult.Ok -> {
                        done += 1
                        val photo = r.value.toMemory()
                        _state.update { it.copy(feed = it.feed.upsert(photo).copy(uploading = images.size - done)) }
                        loadThumbnail(photo.id, photo.thumbnailPath)
                    }
                    is ApiResult.Failed -> failure = trf(Txt.MEM_UPLOAD_FAILED, r.error.code)
                    is ApiResult.Unreachable -> failure = tr(Txt.MEM_UPLOAD_OFFLINE)
                }
            }
            _state.update { it.copy(notice = failure ?: trf(Txt.MEM_UPLOADED, done), feed = it.feed.copy(uploading = 0)) }
        }
    }

    /** A leader clears the flag ("clear") or removes the photo ("remove"). */
    fun review(photoId: String, decision: String): Job = act {
        when (val r = it.reviewPhoto(trip!!.organizationId, trip.tripId, photoId, decision)) {
            is ApiResult.Ok -> _state.update { s -> s.copy(feed = if (decision == "remove") s.feed.without(photoId) else s.feed.upsert(r.value.toMemory()), notice = null) }
            else -> failed(r)
        }
    }

    /** Into the guardian album, tagged whole group (per-person tags are the console's job). */
    fun album(photoId: String): Job = act {
        when (val r = it.albumPhoto(trip!!.organizationId, trip.tripId, photoId, AlbumPhotoRequestDto(wholeGroup = true))) {
            is ApiResult.Ok -> _state.update { s -> s.copy(feed = s.feed.upsert(r.value.toMemory()), notice = null) }
            else -> failed(r)
        }
    }

    fun delete(photoId: String): Job = act {
        when (val r = it.deletePhoto(trip!!.organizationId, trip.tripId, photoId)) {
            is ApiResult.Ok -> _state.update { s -> s.copy(feed = s.feed.without(photoId), notice = null) }
            else -> failed(r)
        }
    }

    private fun act(block: suspend (ApiClient) -> Unit): Job {
        val a = api ?: return Job().also { it.complete() }
        return viewModelScope.launch { block(a) }
    }

    private fun failed(r: ApiResult<*>) {
        _state.update {
            it.copy(
                notice = when (r) {
                    is ApiResult.Failed -> if (r.status == 403) tr(Txt.MEM_REFUSED) else trf(Txt.MEM_ACTION_FAILED, r.error.code)
                    else -> tr(Txt.MEM_OFFLINE)
                },
            )
        }
    }
}
