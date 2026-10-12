// Copyright 2026- At Day. All rights reserved.
// Facts: sample mode shows the fixture and records an answer locally with the device clock; live
// mode lists on start, posts an answer and moves it from pending into the trail; an unreachable
// server keeps the answer pending and marks the feed offline, and a later refresh replays it.
// Slice 073: a leader loads their group's travelers and opens a card; the server's card lands
// through the refresh; sample mode keeps a local card.

package com.voysemble.app.incidents

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.incidents.ConfirmationStatus
import com.voysemble.core.session.ActiveTrip
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class IncidentsViewModelTest {
    private val trip = ActiveTrip("org_1", "Hana", "trip_1", "Seoul", "p-kim", "leader")

    private val card = """
        {"id":"i1","tripId":"trip_1","kind":"headcount_missing","status":"open","title":"Head count closed with 1 missing (Bus A, 06:58)","headcountId":"h1",
         "people":[{"participationId":"p2","displayName":"Juho Kim","groupName":"Bus A"}],"openedAt":"2026-12-31T05:58:01.000Z","openedByName":"Kim",
         "resolvedAt":null,"resolvedByName":null,"resolutionNote":null,"confirmations":[],"guardianMessage":null}
    """.trimIndent()
    private val listJson = """{"incidents":[$card]}"""

    @Before fun main() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun reset() = Dispatchers.resetMain()

    @Test
    fun sample_mode_records_answer_locally() {
        val vm = IncidentsViewModel(deviceClock = { "07:12" })
        assertTrue(!vm.state.value.live)
        assertEquals(2, vm.state.value.feed.cards.size)
        vm.confirm("inc_busB_0650", ConfirmationStatus.WITH_GROUP, "Both on Bus B.")
        val open = vm.state.value.feed.cards.first { it.id == "inc_busB_0650" }
        assertNotNull(open.pending)
        assertEquals("07:12", open.latest?.at)
        assertEquals("Both on Bus B.", open.latest?.note)
    }

    @Test
    fun live_lists_then_posts_answer_into_the_trail() = runTest {
        val posts = mutableListOf<String>()
        val engine = MockEngine { req ->
            if (req.method == HttpMethod.Post) {
                posts += (req.body as TextContent).text
                assertEquals("/v1/orgs/org_1/trips/trip_1/incidents/i1/confirm", req.url.encodedPath)
                respond(card, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            } else {
                respond(listJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            }
        }
        val vm = IncidentsViewModel(ApiClient(ApiClientConfig("h", "t") { "tok" }, engine), trip, deviceClock = { "06:20" })
        vm.ready.join()
        assertTrue(vm.state.value.live)
        assertEquals(listOf("i1"), vm.state.value.feed.cards.map { it.id })
        assertNull(vm.state.value.feed.cards[0].latest)
        vm.confirm("i1", ConfirmationStatus.NOT_WITH_GROUP, null).join()
        assertEquals(listOf("""{"status":"not_with_group","note":null}"""), posts)
        val c = vm.state.value.feed.cards[0]
        assertNull(c.pending)
        assertEquals(ConfirmationStatus.NOT_WITH_GROUP, c.confirmations[0].status)
        assertEquals("06:20", c.confirmations[0].at)
    }

    @Test
    fun a_leader_opens_a_card_naming_travelers_of_their_group() = runTest {
        val roster = """{"participations":[
            {"id":"p-kim","tripId":"trip_1","role":"leader","displayName":"Kim","groupName":"Bus A","guardianOf":null,"accountId":"a","createdAt":"x","invite":"joined","lastAckAt":null,"hasCareNote":false},
            {"id":"p2","tripId":"trip_1","role":"traveler","displayName":"Juho Kim","groupName":"Bus A","guardianOf":null,"accountId":null,"createdAt":"x","invite":"none","lastAckAt":null,"hasCareNote":false},
            {"id":"p3","tripId":"trip_1","role":"traveler","displayName":"Hana Lee","groupName":"Bus B","guardianOf":null,"accountId":null,"createdAt":"x","invite":"none","lastAckAt":null,"hasCareNote":false},
            {"id":"p9","tripId":"trip_1","role":"guardian","displayName":"Sora Park","groupName":"Bus A","guardianOf":"p2","accountId":null,"createdAt":"x","invite":"none","lastAckAt":null,"hasCareNote":false}
        ]}"""
        val manual = card.replace("\"id\":\"i1\"", "\"id\":\"i2\"").replace("Head count closed with 1 missing (Bus A, 06:58)", "Juho feels sick").replace("\"kind\":\"headcount_missing\"", "\"kind\":\"manual\"")
        val posts = mutableListOf<String>()
        val engine = MockEngine { req ->
            val path = req.url.encodedPath
            val json = headersOf(HttpHeaders.ContentType, "application/json")
            when {
                path.endsWith("/roster") -> respond(roster, HttpStatusCode.OK, json)
                req.method == HttpMethod.Post -> {
                    posts += (req.body as TextContent).text
                    assertEquals("/v1/orgs/org_1/trips/trip_1/incidents", path)
                    respond(manual, HttpStatusCode.Created, json)
                }
                else -> respond(if (posts.isEmpty()) listJson else """{"incidents":[$manual,$card]}""", HttpStatusCode.OK, json)
            }
        }
        val vm = IncidentsViewModel(ApiClient(ApiClientConfig("h", "t") { "tok" }, engine), trip, deviceClock = { "06:20" })
        vm.ready.join()
        assertTrue(vm.canOpen)
        vm.loadTravelers().join()
        // Bus A's travelers only: Juho, not Hana (Bus B), not the guardian, not the leader.
        assertEquals(listOf("Juho Kim"), vm.state.value.travelers?.map { it.displayName })
        vm.openIncident("  Juho feels sick ", listOf("p2")).join()
        assertEquals(listOf("""{"title":"Juho feels sick","participationIds":["p2"]}"""), posts)
        assertEquals(listOf("i2", "i1"), vm.state.value.feed.cards.map { it.id })
        assertNull(vm.state.value.openError)
        // Sample mode: the fixture's travelers and a local card on top.
        val sample = IncidentsViewModel(deviceClock = { "07:12" })
        sample.loadTravelers()
        assertEquals(listOf("Minji Park", "Juho Kim", "Seojun Choi"), sample.state.value.travelers?.map { it.displayName })
        sample.openIncident("Lost passport", listOf("t1"))
        val local = sample.state.value.feed.cards.first()
        assertEquals("Lost passport", local.title)
        assertEquals(listOf("Minji Park"), local.people)
        assertEquals("07:12", local.openedAt)
    }

    @Test
    fun offline_keeps_answer_pending_and_refresh_replays_it() = runTest {
        var online = false
        val posts = mutableListOf<String>()
        // Once an answer was posted the server's list carries it, as the real server does.
        val confirmedCard = card.replace(
            "\"confirmations\":[]",
            "\"confirmations\":[{\"id\":\"c9\",\"status\":\"unknown\",\"note\":null,\"confirmedByName\":\"Kim\",\"confirmedByRole\":\"leader\",\"confirmedAt\":\"2026-12-31T06:20:00.000Z\"}]",
        )
        val engine = MockEngine { req ->
            if (!online) throw IllegalStateException("no route")
            if (req.method == HttpMethod.Post) {
                posts += (req.body as TextContent).text
                respond(confirmedCard, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            } else {
                val body = if (posts.isEmpty()) listJson else """{"incidents":[$confirmedCard]}"""
                respond(body, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            }
        }
        val vm = IncidentsViewModel(ApiClient(ApiClientConfig("h", "t") { "tok" }, engine), trip, deviceClock = { "06:20" })
        vm.ready.join()
        assertTrue(vm.state.value.feed.offline)
        online = true
        vm.refresh().join()
        assertTrue(!vm.state.value.feed.offline)
        online = false
        vm.confirm("i1", ConfirmationStatus.UNKNOWN, null).join()
        assertNotNull(vm.state.value.feed.cards[0].pending)
        assertTrue(vm.state.value.feed.offline)
        online = true
        vm.refresh().join()
        assertEquals(1, posts.size)
        assertNull(vm.state.value.feed.cards[0].pending)
        assertEquals(ConfirmationStatus.UNKNOWN, vm.state.value.feed.cards[0].confirmations[0].status)
    }
}
