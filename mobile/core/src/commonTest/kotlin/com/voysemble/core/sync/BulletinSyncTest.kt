// Copyright 2026- At Day. All rights reserved.
// Facts: a sync replays the outbox before listing, merges the server list, and reports
// confirmations; when the server is unreachable the local feed survives marked offline.

package com.voysemble.core.sync

import com.voysemble.core.announcements.AnnouncementFeed
import com.voysemble.core.announcements.AnnouncementItem
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.today.AckState
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BulletinSyncTest {
    private fun item(id: String, ack: AckState) = AnnouncementItem(id, "t", "b", null, "a", "00:00", true, false, ack, 0, 4)

    @Test
    fun replays_then_lists_and_merges() = runTest {
        val calls = mutableListOf<String>()
        val engine = MockEngine { req ->
            calls += "${req.method.value} ${req.url.encodedPath}"
            if (req.url.encodedPath.endsWith("/ack")) {
                respond("""{"announcementId":"a1","participationId":"p","created":true,"ackedAtDevice":"x","receivedAt":"y"}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            } else {
                respond("""{"announcements":[{"id":"a1","tripId":"t","title":"T","body":"B","requiresAck":true,"sharedWithGuardians":false,"authorName":"Kim","publishedAt":"2026-12-31T06:00:00.000Z","ackTotal":4,"ackCount":1,"myAck":"acknowledged"}]}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            }
        }
        val api = ApiClient(ApiClientConfig("h", "t"), engine)
        val local = AnnouncementFeed(listOf(item("a1", AckState.PENDING)), outbox = listOf("a1"), offline = true)
        val r = syncBulletin(api, "o", "t", local, { "2026-12-31T05:50:00.000Z" }) { it.substring(11, 16) }
        assertTrue(r.reachable)
        assertEquals(1, r.confirmed)
        assertEquals(AckState.ACKNOWLEDGED, r.feed.items.single().ack)
        assertEquals(emptyList(), r.feed.outbox)
        assertEquals(false, r.feed.offline)
        assertEquals(listOf("POST /v1/orgs/o/trips/t/announcements/a1/ack", "GET /v1/orgs/o/trips/t/announcements"), calls)
    }

    @Test
    fun unreachable_keeps_local_feed_offline_with_outbox() = runTest {
        val engine = MockEngine { throw RuntimeException("no network") }
        val api = ApiClient(ApiClientConfig("h", "t"), engine)
        val local = AnnouncementFeed(listOf(item("a1", AckState.PENDING)), outbox = listOf("a1"), offline = false)
        val r = syncBulletin(api, "o", "t", local, { "now" }) { it }
        assertEquals(false, r.reachable)
        assertEquals(0, r.confirmed)
        assertEquals(listOf("a1"), r.feed.outbox)
        assertEquals(true, r.feed.offline)
        assertEquals(AckState.PENDING, r.feed.items.single().ack)
    }
}
