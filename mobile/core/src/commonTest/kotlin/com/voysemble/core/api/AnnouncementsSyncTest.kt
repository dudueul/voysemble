// Copyright 2026- At Day. All rights reserved.
// Facts: list decodes and merges (server-acknowledged wins, queued stays pending, others clear);
// ack sends the bearer token and body; replay confirms on Ok and keeps ids on failure.

package com.voysemble.core.api

import com.voysemble.core.announcements.AnnouncementFeed
import com.voysemble.core.announcements.AnnouncementItem
import com.voysemble.core.today.AckState
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

class AnnouncementsSyncTest {
    private val config = ApiClientConfig(host = "test.dev.voysemble.cfd", userAgent = "test", sessionToken = { "tok-1" })

    private val listJson = """
        {"announcements":[
          {"id":"a1","tripId":"t","title":"Breakfast","body":"Lobby","requiresAck":true,"sharedWithGuardians":true,"authorName":"Organizer","publishedAt":"2026-12-30T20:30:00.000Z","ackTotal":4,"ackCount":1,"myAck":"acknowledged","translation":{"locale":"ko","body":"로비","provider":"edited","editedBy":"Kim"}},
          {"id":"a2","tripId":"t","title":"Seats","body":"Rows 1-4","requiresAck":true,"sharedWithGuardians":false,"authorName":"Kim","publishedAt":"2026-12-31T06:00:00.000Z","ackTotal":4,"ackCount":0,"myAck":"unacknowledged"},
          {"id":"a3","tripId":"t","title":"FYI","body":"No ack","requiresAck":false,"sharedWithGuardians":false,"authorName":"Kim","publishedAt":"2026-12-31T06:10:00.000Z","ackTotal":4,"ackCount":0,"myAck":"unacknowledged"}
        ]}
    """.trimIndent()

    private fun item(id: String, ack: AckState) = AnnouncementItem(id, "x", "y", null, "z", "00:00", true, false, ack, 0, 0)

    @Test
    fun list_sends_bearer_and_merge_respects_outbox() = runTest {
        var auth: String? = null
        val engine = MockEngine { req ->
            auth = req.headers[HttpHeaders.Authorization]
            assertEquals("https://test.dev.voysemble.cfd/v1/orgs/o/trips/t/announcements", req.url.toString())
            respond(listJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val result = ApiClient(config, engine).listAnnouncements("o", "t")
        val ok = assertIs<ApiResult.Ok<AnnouncementListDto>>(result)
        assertEquals("Bearer tok-1", auth)
        val local = AnnouncementFeed(items = listOf(item("a2", AckState.PENDING), item("stale", AckState.PENDING)), outbox = listOf("a2", "stale"), offline = false)
        val merged = mergeAnnouncements(local, ok.value.announcements) { it.substring(11, 16) }
        assertEquals(listOf("a1", "a2", "a3"), merged.items.map { it.id })
        assertEquals(AckState.ACKNOWLEDGED, merged.items[0].ack)
        assertEquals(AckState.PENDING, merged.items[1].ack)
        assertEquals(AckState.UNACKNOWLEDGED, merged.items[2].ack)
        assertEquals("20:30", merged.items[0].publishedAt)
        assertEquals("로비", merged.items[0].machineTranslation)
        assertEquals("Translation edited by Kim · 한국어", merged.items[0].translationLabel)
        assertNull(merged.items[1].machineTranslation)
        assertNull(merged.items[1].translationLabel)
        assertEquals(listOf("a2"), merged.outbox)
    }

    @Test
    fun ack_posts_body_and_replay_confirms_or_keeps() = runTest {
        var body: String? = null
        val engine = MockEngine { req ->
            body = (req.body as io.ktor.http.content.TextContent).text
            if (req.url.encodedPath.contains("/a2/")) {
                respond("""{"announcementId":"a2","participationId":"p","created":true,"ackedAtDevice":"2026-12-31T05:50:00.000Z","receivedAt":"2026-12-31T05:50:01.000Z"}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            } else {
                respond("""{"error":{"code":"NOT_FOUND","message":"gone","correlationId":"c"}}""", HttpStatusCode.NotFound, headersOf(HttpHeaders.ContentType, "application/json"))
            }
        }
        val api = ApiClient(config, engine)
        val feed = AnnouncementFeed(items = listOf(item("a2", AckState.PENDING), item("a9", AckState.PENDING)), outbox = listOf("a2", "a9"), offline = false)
        val replay = replayAckOutbox(feed, ackedAtDevice = { "2026-12-31T05:50:00.000Z" }) { id, at -> api.ackAnnouncement("o", "t", id, at) }
        assertEquals(listOf("a2"), replay.confirmed)
        assertEquals(listOf("a9"), replay.remaining)
        assertEquals(AckState.ACKNOWLEDGED, replay.feed.items.first { it.id == "a2" }.ack)
        assertEquals(listOf("a9"), replay.feed.outbox)
        assertEquals("""{"ackedAtDevice":"2026-12-31T05:50:00.000Z"}""", body)
    }

    @Test
    fun revision_announcement_maps_to_change_lines() = runTest {
        val json = """
            {"announcements":[
              {"id":"r2","tripId":"t","title":"Itinerary updated","body":"The itinerary was updated: 3 changes.","requiresAck":true,"sharedWithGuardians":true,"authorName":"Organizer","publishedAt":"2026-12-30T22:10:00.000Z","ackTotal":4,"ackCount":0,"myAck":"unacknowledged","translation":null,"kind":"itinerary_revision",
               "revision":{"revision":2,"fromRevision":1,"added":1,"changed":1,"removed":1,"changes":[
                 {"kind":"changed","eventId":"a","date":"2026-12-31","day":4,"title":"Colosseum","start":"08:30","fields":["start"],"previousStart":"09:00"},
                 {"kind":"added","eventId":"b","date":"2026-12-31","day":4,"title":"Gelato stop","start":"11:15","fields":[],"previousStart":null},
                 {"kind":"removed","eventId":"c","date":"2027-01-01","day":5,"title":"Lunch","start":"12:00","fields":[],"previousStart":null}]}}
            ]}
        """.trimIndent()
        val engine = MockEngine { respond(json, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json")) }
        val ok = assertIs<ApiResult.Ok<AnnouncementListDto>>(ApiClient(config, engine).listAnnouncements("o", "t"))
        val merged = mergeAnnouncements(AnnouncementFeed(emptyList(), emptyList(), false), ok.value.announcements) { it.substring(11, 16) }
        val item = merged.items.single()
        assertEquals(true, item.isRevision)
        assertEquals(2, item.revisionNumber)
        assertEquals(listOf("Day 4 · Colosseum · 09:00 → 08:30", "Day 4 · Gelato stop · added 11:15", "Day 5 · Lunch · removed"), item.changeLines)
        assertEquals(AckState.UNACKNOWLEDGED, item.ack)
    }
}
