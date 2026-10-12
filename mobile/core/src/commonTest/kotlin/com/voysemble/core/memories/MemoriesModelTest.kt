// Copyright 2026- At Day. All rights reserved.
// Facts (D18, slice 044): a wire photo becomes a memory (the flag only while flagged); the feed
// splits into queue, pool and album; the role rules; captions and album labels in both
// languages; the summary per role; upsert replaces or prepends and without removes.

package com.voysemble.core.memories

import com.voysemble.core.api.PhotoAlbumDto
import com.voysemble.core.api.PhotoDto
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.i18n.AppLocale
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class MemoriesModelTest {
    @AfterTest
    fun reset() {
        AppLocale.current = "en"
    }

    private fun dto(id: String, status: String, flag: String? = null, album: PhotoAlbumDto? = null, mine: Boolean = false) = PhotoDto(
        id = id, tripId = "t", uploaderName = "Minji Park", uploaderRole = "traveler", mine = mine, day = 4,
        takenAt = "2026-12-29T00:30:00.000Z", contentType = "image/jpeg", bytes = 1200, thumbnailBytes = 300,
        status = status, flag = flag, reviewedByName = null, album = album, uploadedAt = "2026-12-29T00:31:00.000Z",
        thumbnailUrl = "/v1/orgs/o/trips/t/media/$id/thumbnail", contentUrl = "/v1/orgs/o/trips/t/media/$id/content",
    )

    @Test
    fun wire_to_memory_and_the_three_sections() {
        val cleared = dto("a", "pool", flag = "nudity").toMemory()
        assertNull(cleared.flag)
        val flagged = dto("b", "flagged", flag = "violence").toMemory()
        assertEquals("violence", flagged.flag)
        val approved = dto("c", "approved", album = PhotoAlbumDto("2026-12-29T01:00:00.000Z", "Kim", true, emptyList(), listOf("Minji Park"))).toMemory()
        assertTrue(approved.wholeGroup)
        val feed = MemoriesFeed(listOf(cleared, flagged, approved))
        assertEquals(listOf("b"), feed.queue().map { it.id })
        assertEquals(listOf("a", "c"), feed.pool().map { it.id })
        assertEquals(listOf("c"), feed.album().map { it.id })
        assertEquals("Whole group · Minji Park", approved.albumLabel())
        assertEquals("Minji Park · Day 4", cleared.caption())
        assertEquals("/v1/orgs/o/trips/t/media/a/thumbnail", cleared.thumbnailPath)
    }

    @Test
    fun roles() {
        assertTrue(canReviewPhotos("leader"))
        assertTrue(canReviewPhotos(null))
        assertTrue(!canReviewPhotos("traveler"))
        assertTrue(canUploadPhotos("traveler"))
        assertTrue(!canUploadPhotos("guardian"))
        val mine = dto("m", "pool", mine = true).toMemory()
        val other = dto("o", "pool").toMemory()
        assertTrue(mine.canDelete("traveler"))
        assertTrue(!other.canDelete("traveler"))
        assertTrue(other.canDelete("leader"))
    }

    @Test
    fun summary_per_role_and_the_fixture_in_korean() {
        val feed = KoreaConcertTourFixture.memories()
        assertEquals("5 in the pool · 2 in the album · 1 to review", feed.summary("leader"))
        assertEquals("5 in the pool · 2 in the album", feed.summary("traveler"))
        assertEquals("2 approved photos of your traveler", feed.summary("guardian"))
        assertEquals("Possible nudity", flagLabel("nudity"))
        AppLocale.current = "ko"
        assertEquals("사진첩 5장 · 앨범 2장 · 검토 1장", feed.summary("leader"))
        assertEquals("Juho Kim · 4일차", feed.queue().first().caption())
        assertEquals("그룹 전체", feed.album().first { it.wholeGroup }.albumLabel())
    }

    @Test
    fun upsert_and_without() {
        val feed = MemoriesFeed(listOf(dto("a", "pool").toMemory()))
        val added = feed.upsert(dto("b", "pool").toMemory())
        assertEquals(listOf("b", "a"), added.photos.map { it.id })
        val replaced = added.upsert(dto("a", "approved", album = PhotoAlbumDto("x", "Kim", true, emptyList(), emptyList())).toMemory())
        assertEquals(listOf("b", "a"), replaced.photos.map { it.id })
        assertEquals("approved", replaced.photos[1].status)
        assertEquals(listOf("b"), replaced.without("a").photos.map { it.id })
        assertTrue(replaced.withOffline(true).offline)
    }
}
