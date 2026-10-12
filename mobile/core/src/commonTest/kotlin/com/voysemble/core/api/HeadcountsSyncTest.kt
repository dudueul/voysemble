// Copyright 2026- At Day. All rights reserved.
// Facts: a roster seeds a group's travelers only; the sync body omits unmarked members and uses
// wire mark names; a PUT carries the bearer token to the id path; Ok marks the session synced
// (also when the server kept its closed copy); a rejection or no network keeps it pending.

package com.voysemble.core.api

import com.voysemble.core.headcount.HeadcountMark
import com.voysemble.core.headcount.SyncState
import com.voysemble.core.headcount.close
import com.voysemble.core.headcount.mark
import com.voysemble.core.headcount.markSynced
import com.voysemble.core.headcount.togglePresent
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class HeadcountsSyncTest {
    private val config = ApiClientConfig(host = "test.dev.voysemble.cfd", userAgent = "test", sessionToken = { "tok-1" })

    private fun p(id: String, name: String, role: String, group: String?) =
        ParticipationDto(id = id, tripId = "t", role = role, displayName = name, groupName = group, createdAt = "2026-10-11T00:00:00.000Z")

    private val roster = listOf(
        p("p-minji", "Minji Park", "traveler", "Bus A"),
        p("p-juho", "Juho Kim", "traveler", "Bus A"),
        p("p-seojun", "Seojun Choi", "traveler", "Bus B"),
        p("p-kim", "Kim", "leader", "Bus A"),
        p("p-guardian", "Park Sr.", "guardian", "Bus A"),
    )

    private fun sessionJson(closed: Boolean) = """
        {"session":{"id":"11111111-1111-4111-8111-111111111111","tripId":"t","groupName":"Bus A","openedByName":"Kim",
         "openedAtDevice":"06:50","closedAtDevice":${if (closed) "\"06:58\"" else "null"},"receivedAt":"2026-12-31T06:58:01.000Z",
         "expected":2,"present":1,"accounted":2,"missing":[],"closedWithMissing":false},"applied":${!closed},"incidentId":${if (closed) "null" else "\"77777777-7777-4777-8777-777777777777\""}}
    """.trimIndent()

    @Test
    fun roster_seeds_group_travelers_sorted_and_body_omits_unmarked() {
        val s = headcountFromRoster("11111111-1111-4111-8111-111111111111", roster, "Bus A", "Kim", "06:50")
        assertEquals(listOf("Juho Kim", "Minji Park"), s.members.map { it.name })
        assertEquals("Bus A", s.groupLabel)
        assertEquals(SyncState.PENDING, s.syncState)
        val whole = headcountFromRoster("x", roster, null, "Kim", "06:50")
        assertEquals(3, whole.expected)
        assertNull(whole.toSyncRequest().groupName)

        val marked = s.togglePresent("p-minji").mark("p-juho", HeadcountMark.EXCUSED)
        val body = marked.toSyncRequest()
        assertEquals("Bus A", body.groupName)
        assertNull(body.closedAtDevice)
        assertEquals(listOf("p-juho" to "excused", "p-minji" to "present"), body.marks.map { it.participationId to it.mark })
        assertEquals(listOf(HeadcountMarkInputDto("p-juho", "excused"), HeadcountMarkInputDto("p-minji", "present")), body.marks)
        assertEquals(1, s.togglePresent("p-minji").toSyncRequest().marks.size)
    }

    @Test
    fun push_puts_whole_session_with_bearer_and_marks_synced() = runTest {
        var method: HttpMethod? = null
        var auth: String? = null
        var body: String? = null
        val engine = MockEngine { req ->
            method = req.method
            auth = req.headers[HttpHeaders.Authorization]
            body = (req.body as TextContent).text
            assertEquals("https://test.dev.voysemble.cfd/v1/orgs/o/trips/t/headcounts/11111111-1111-4111-8111-111111111111", req.url.toString())
            respond(sessionJson(closed = false), HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val s = headcountFromRoster("11111111-1111-4111-8111-111111111111", roster, "Bus A", "Kim", "06:50")
            .togglePresent("p-minji")
            .close("06:58")
        val r = pushHeadcount(ApiClient(config, engine), "o", "t", s)
        assertEquals(HttpMethod.Put, method)
        assertEquals("Bearer tok-1", auth)
        assertEquals(
            """{"openedAtDevice":"06:50","closedAtDevice":"06:58","groupName":"Bus A","marks":[{"participationId":"p-juho","mark":"missing"},{"participationId":"p-minji","mark":"present"}]}""",
            body,
        )
        assertEquals("synced", r.outcome)
        assertEquals(SyncState.SYNCED, r.session.syncState)
        assertEquals("77777777-7777-4777-8777-777777777777", r.incidentId)
    }

    /** The open-session push must carry `closedAtDevice: null` explicitly: the API rejects a missing key. */
    @Test
    fun open_session_body_encodes_null_closed_at_and_group() = runTest {
        var body: String? = null
        val engine = MockEngine { req ->
            body = (req.body as TextContent).text
            respond(sessionJson(closed = false), HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val whole = headcountFromRoster("11111111-1111-4111-8111-111111111111", roster, null, "Kim", "06:50")
        pushHeadcount(ApiClient(config, engine), "o", "t", whole)
        assertEquals("""{"openedAtDevice":"06:50","closedAtDevice":null,"groupName":null,"marks":[]}""", body)
    }

    @Test
    fun already_closed_counts_as_synced_and_rejection_or_offline_stays_pending() = runTest {
        val s = headcountFromRoster("11111111-1111-4111-8111-111111111111", roster, "Bus A", "Kim", "06:50").close("06:58")
        val closedEngine = MockEngine { respond(sessionJson(closed = true), HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json")) }
        val kept = pushHeadcount(ApiClient(config, closedEngine), "o", "t", s)
        assertEquals("already-closed", kept.outcome)
        assertEquals(SyncState.SYNCED, kept.session.syncState)
        assertNull(kept.incidentId)

        val conflictEngine = MockEngine {
            respond("""{"error":{"code":"CONFLICT","message":"other trip","correlationId":"c"}}""", HttpStatusCode.Conflict, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val rejected = pushHeadcount(ApiClient(config, conflictEngine), "o", "t", s)
        assertEquals("rejected:409", rejected.outcome)
        assertEquals(SyncState.PENDING, rejected.session.syncState)

        val offline = pushHeadcount(ApiClient(config, MockEngine { throw IllegalStateException("no route") }), "o", "t", s)
        assertEquals("offline", offline.outcome)
        assertEquals(SyncState.PENDING, offline.session.syncState)
    }

    @Test
    fun adoptPush_keeps_marks_made_while_the_push_was_in_flight() {
        val pushed = headcountFromRoster("hc1", listOf(p("t1", "A", "traveler", "Bus A"), p("t2", "B", "traveler", "Bus A")), "Bus A", "Kim", "06:50")
            .togglePresent("t1")
        val synced = HeadcountPushResult(pushed.markSynced(), "synced")
        // Nothing changed meanwhile: the synced copy is adopted.
        assertEquals(SyncState.SYNCED, pushed.adoptPush(synced).syncState)
        // A mark landed during the push: keep the device copy, still pending.
        val changed = pushed.togglePresent("t2")
        assertEquals(changed, changed.adoptPush(synced))
        assertEquals(SyncState.PENDING, changed.adoptPush(synced).syncState)
        // A rejection never flips the flag.
        assertEquals(pushed, pushed.adoptPush(HeadcountPushResult(pushed, "rejected:403")))
    }
}
