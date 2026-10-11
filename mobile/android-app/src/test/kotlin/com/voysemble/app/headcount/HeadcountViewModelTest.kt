// Copyright 2026- At Day. All rights reserved.
// Facts: sample mode: toggling marks present and flips to pending sync; closing uses the injected
// device clock, marks the rest missing, and is final. Live mode: the roster seeds the leader's own
// group, the open session is pushed once, close pushes the whole session and lands SYNCED; a
// rejected push keeps PENDING with a safe message and retrySync pushes again.

package com.voysemble.app.headcount

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.headcount.HeadcountMark
import com.voysemble.core.headcount.SyncState
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
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class HeadcountViewModelTest {
    private val trip = ActiveTrip("org_1", "Hana", "trip_1", "Seoul", "p-kim", "leader")

    private val rosterJson = """
        {"participations":[
          {"id":"p-minji","tripId":"trip_1","role":"traveler","displayName":"Minji Park","groupName":"Bus A","guardianOf":null,"accountId":null,"createdAt":"2026-10-11T00:00:00.000Z"},
          {"id":"p-juho","tripId":"trip_1","role":"traveler","displayName":"Juho Kim","groupName":"Bus A","guardianOf":null,"accountId":null,"createdAt":"2026-10-11T00:00:00.000Z"},
          {"id":"p-seojun","tripId":"trip_1","role":"traveler","displayName":"Seojun Choi","groupName":"Bus B","guardianOf":null,"accountId":null,"createdAt":"2026-10-11T00:00:00.000Z"},
          {"id":"p-kim","tripId":"trip_1","role":"leader","displayName":"Kim","groupName":"Bus A","guardianOf":null,"accountId":"acc_kim","createdAt":"2026-10-11T00:00:00.000Z"}
        ]}
    """.trimIndent()

    private fun sessionJson(closed: Boolean) = """
        {"session":{"id":"11111111-1111-4111-8111-111111111111","tripId":"trip_1","groupName":"Bus A","openedByName":"Kim",
         "openedAtDevice":"06:50","closedAtDevice":${if (closed) "\"06:58\"" else "null"},"receivedAt":"2026-12-31T06:58:01.000Z",
         "expected":2,"present":1,"accounted":2,"missing":[],"closedWithMissing":false},"applied":true}
    """.trimIndent()

    @Before fun main() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun reset() = Dispatchers.resetMain()

    @Test
    fun sample_toggle_then_close_with_device_clock() {
        val vm = HeadcountViewModel(deviceClock = { "06:58" })
        assertTrue(!vm.status.value.live)
        vm.togglePresent("t7")
        assertEquals(19, vm.state.value.presentCount)
        assertEquals(SyncState.PENDING, vm.state.value.syncState)
        vm.excuse("t5")
        vm.close()
        assertEquals("06:58", vm.state.value.closedAtDevice)
        assertEquals(HeadcountMark.EXCUSED, vm.state.value.markOf("t5"))
        assertTrue(vm.state.value.isClosed)
        vm.togglePresent("t1")
        assertEquals(HeadcountMark.PRESENT, vm.state.value.markOf("t1"))
    }

    @Test
    fun live_seeds_leader_group_pushes_open_then_closed() = runTest {
        val puts = mutableListOf<String>()
        val engine = MockEngine { req ->
            if (req.method == HttpMethod.Put) {
                puts += (req.body as TextContent).text
                assertEquals("/v1/orgs/org_1/trips/trip_1/headcounts/11111111-1111-4111-8111-111111111111", req.url.encodedPath)
                respond(sessionJson(closed = puts.size > 1), HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            } else {
                assertEquals("/v1/orgs/org_1/trips/trip_1/roster", req.url.encodedPath)
                respond(rosterJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            }
        }
        val clock = mutableListOf("06:50", "06:58")
        val vm = HeadcountViewModel(
            api = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine),
            trip = trip,
            deviceClock = { clock.removeAt(0) },
            newId = { "11111111-1111-4111-8111-111111111111" },
        )
        vm.ready.join()
        assertTrue(vm.status.value.live)
        assertTrue(!vm.status.value.loading)
        assertEquals(listOf("Juho Kim", "Minji Park"), vm.state.value.members.map { it.name })
        assertEquals("Bus A", vm.state.value.groupLabel)
        assertEquals("Kim", vm.state.value.openedBy)
        assertEquals(1, puts.size)
        assertEquals("""{"openedAtDevice":"06:50","closedAtDevice":null,"groupName":"Bus A","marks":[]}""", puts[0])
        assertEquals(SyncState.SYNCED, vm.state.value.syncState)

        vm.togglePresent("p-minji")
        assertEquals(SyncState.PENDING, vm.state.value.syncState)
        vm.close().join()
        assertEquals(2, puts.size)
        assertEquals(
            """{"openedAtDevice":"06:50","closedAtDevice":"06:58","groupName":"Bus A","marks":[{"participationId":"p-juho","mark":"missing"},{"participationId":"p-minji","mark":"present"}]}""",
            puts[1],
        )
        assertEquals(SyncState.SYNCED, vm.state.value.syncState)
        assertEquals("synced", vm.status.value.lastPush)
        assertNull(vm.status.value.error)
    }

    @Test
    fun live_rejected_push_stays_pending_and_retry_syncs() = runTest {
        var refuse = true
        val engine = MockEngine { req ->
            when {
                req.method != HttpMethod.Put -> respond(rosterJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
                refuse -> respond("""{"error":{"code":"FORBIDDEN","message":"no","correlationId":"c"}}""", HttpStatusCode.Forbidden, headersOf(HttpHeaders.ContentType, "application/json"))
                else -> respond(sessionJson(closed = true), HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            }
        }
        val vm = HeadcountViewModel(
            api = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine),
            trip = trip,
            deviceClock = { "06:58" },
            newId = { "11111111-1111-4111-8111-111111111111" },
        )
        vm.ready.join()
        assertEquals(SyncState.PENDING, vm.state.value.syncState)
        assertEquals("rejected:403", vm.status.value.lastPush)
        assertEquals("The server refused this count (403).", vm.status.value.error)
        vm.close().join()
        assertTrue(vm.state.value.isClosed)
        assertEquals(SyncState.PENDING, vm.state.value.syncState)
        refuse = false
        vm.retrySync().join()
        assertEquals(SyncState.SYNCED, vm.state.value.syncState)
        assertNull(vm.status.value.error)
    }
}
