// Copyright 2026- At Day. All rights reserved.
// Facts: sample mode flips the fixture switch locally and never posts; live mode lists on start
// and shows the open window with the traveler's own row; switching on judges one fix against the
// meeting point on the device and posts only the state ("inside" here), never a coordinate; no
// fix posts "uncertain"; switching off posts "opted_out"; a closed window answers 409 and the
// screen says so; an empty list shows no window; an unreachable server says offline.

package com.voysemble.app.window

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.session.ActiveTrip
import com.voysemble.core.window.LocationFix
import com.voysemble.core.window.LocationSource
import com.voysemble.core.window.WindowState
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
class MeetingWindowViewModelTest {
    private val minji = ActiveTrip("org_1", "Seoul Arts High", "trip_1", "Korea Concert Tour", "p-minji", "traveler")

    private fun window(state: String = "opted_out", status: String = "open") = """
        {"id":"w1","tripId":"trip_1","label":"Colosseum regroup","place":"Colosseum, main entrance","radiusMeters":200,
         "startsAt":"2026-12-31T09:45:00.000Z","endsAt":"2026-12-31T10:20:00.000Z","groups":["Bus A"],"openedByName":"Kim",
         "openedAt":"2026-12-31T09:40:00.000Z","closedAt":null,"status":"$status","center":{"lat":41.8902,"lng":12.4922},
         "members":[{"participationId":"p-minji","displayName":"Minji Park","groupName":"Bus A","state":"$state","reportedAt":null}],
         "counts":{"inside":0,"outside":0,"uncertain":0,"stale":0,"optedOut":1,"total":1}}
    """.trimIndent()

    private val json = headersOf(HttpHeaders.ContentType, "application/json")

    @Before fun main() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun reset() = Dispatchers.resetMain()

    /** A client whose reports are recorded; the list answer is the open window. */
    private fun client(posts: MutableList<String>, listBody: String = """{"windows":[${window()}]}""", reportStatus: HttpStatusCode = HttpStatusCode.OK) = ApiClient(
        ApiClientConfig("h", "t") { "tok" },
        MockEngine { req ->
            if (req.method == HttpMethod.Put) {
                assertEquals("/v1/orgs/org_1/trips/trip_1/windows/w1/me", req.url.encodedPath)
                val body = (req.body as TextContent).text
                posts += body
                if (reportStatus != HttpStatusCode.OK) {
                    respond("""{"error":{"code":"WINDOW_CLOSED","message":"closed","correlationId":"c"}}""", reportStatus, json)
                } else {
                    val state = Regex("\"state\":\"([a-z_]+)\"").find(body)!!.groupValues[1]
                    respond("""{"state":"$state","reportedAt":"2026-12-31T09:50:00.000Z","windowStatus":"open"}""", HttpStatusCode.OK, json)
                }
            } else {
                respond(listBody, HttpStatusCode.OK, json)
            }
        },
    )

    @Test
    fun sample_mode_flips_the_fixture_locally() {
        val vm = MeetingWindowViewModel()
        assertTrue(!vm.state.value.live)
        assertEquals(WindowState.OPTED_OUT, vm.state.value.window?.me?.state)
        vm.setSharing(true)
        assertEquals(WindowState.UNCERTAIN, vm.state.value.window?.me?.state)
        vm.setSharing(false)
        assertEquals(WindowState.OPTED_OUT, vm.state.value.window?.me?.state)
    }

    @Test
    fun live_judges_the_fix_on_the_device_and_posts_only_the_state() = runTest {
        val posts = mutableListOf<String>()
        // 15 m from the meeting point, accuracy 10 m: inside a 200 m zone whatever the error.
        val nearby = LocationSource { LocationFix(41.8903, 12.4923, 10.0) }
        val vm = MeetingWindowViewModel(client(posts), minji, nearby, deviceClock = { "10:52" }, tickMs = Long.MAX_VALUE)
        vm.ready.join()
        assertTrue(vm.state.value.live)
        assertEquals("Colosseum regroup", vm.state.value.window?.label)
        assertEquals(WindowState.OPTED_OUT, vm.state.value.window?.me?.state)
        assertNull(vm.state.value.error)
        vm.setSharing(true).join()
        assertEquals(listOf("""{"state":"inside"}"""), posts)
        assertEquals(WindowState.INSIDE, vm.state.value.window?.me?.state)
        vm.setSharing(false).join()
        assertEquals("""{"state":"opted_out"}""", posts.last())
        assertEquals(WindowState.OPTED_OUT, vm.state.value.window?.me?.state)
        for (p in posts) assertTrue(!p.contains("41.89"), "a coordinate left the device: $p")
    }

    @Test
    fun without_a_fix_the_report_is_uncertain() = runTest {
        val posts = mutableListOf<String>()
        val vm = MeetingWindowViewModel(client(posts), minji, LocationSource { null }, tickMs = Long.MAX_VALUE)
        vm.ready.join()
        vm.setSharing(true).join()
        assertEquals(listOf("""{"state":"uncertain"}"""), posts)
        assertEquals(WindowState.UNCERTAIN, vm.state.value.window?.me?.state)
    }

    @Test
    fun a_closed_window_refuses_the_report_and_the_screen_says_so() = runTest {
        val posts = mutableListOf<String>()
        val vm = MeetingWindowViewModel(client(posts, reportStatus = HttpStatusCode.Conflict), minji, LocationSource { null }, tickMs = Long.MAX_VALUE)
        vm.ready.join()
        vm.setSharing(true).join()
        assertEquals("This window has ended.", vm.state.value.error)
    }

    @Test
    fun no_window_open_shows_nothing_without_an_error() = runTest {
        val vm = MeetingWindowViewModel(client(mutableListOf(), listBody = """{"windows":[]}"""), minji, null, tickMs = Long.MAX_VALUE)
        vm.ready.join()
        assertNull(vm.state.value.window)
        assertNull(vm.state.value.error)
        assertTrue(!vm.state.value.syncing)
        // No window: the switch has nothing to report and never calls the network.
        vm.setSharing(true).join()
    }

    @Test
    fun unreachable_server_says_offline() = runTest {
        val api = ApiClient(ApiClientConfig("h", "t") { "tok" }, MockEngine { throw IllegalStateException("no route") })
        val vm = MeetingWindowViewModel(api, minji, null, tickMs = Long.MAX_VALUE)
        vm.ready.join()
        assertNull(vm.state.value.window)
        assertEquals("Offline. The window needs one connection.", vm.state.value.error)
    }
}
