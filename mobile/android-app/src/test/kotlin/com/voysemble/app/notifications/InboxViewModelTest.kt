// Copyright 2026- At Day. All rights reserved.
// Facts (D29, slice 053): sample mode shows the fixture and reads without the network; live mode
// loads my inbox with the phone's labels, a read flips at once and the server's row confirms it,
// a failed read goes back with a notice, an unreachable server says offline on load and keeps a
// local read with a notice; the device label prints today's time alone and a date before.

package com.voysemble.app.notifications

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.notifications.summary
import com.voysemble.core.notifications.unreadCount
import com.voysemble.core.session.ActiveTrip
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
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
import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class InboxViewModelTest {
    private val kim = ActiveTrip("org_1", "Seoul Arts High", "trip_1", "Korea Concert Tour", "p-kim", "leader")
    private val json = headersOf(HttpHeaders.ContentType, "application/json")
    private val inboxJson = """{"notifications":[{"id":"n1","tripId":"trip_1","lane":"priority","kind":"headcount_call","title":"Head count: Bus A","body":"Kim opened a count.","refType":"headcount","refId":"hc1","createdAt":"2026-12-31T05:52:00.000Z","deliverAt":"2026-12-31T05:52:00.000Z","readAt":null},{"id":"n2","tripId":"trip_1","lane":"normal","kind":"announcement","title":"Call time 17:30","body":"Lobby by 17:20.","refType":"announcement","refId":"an2","createdAt":"2026-12-31T05:40:00.000Z","deliverAt":"2026-12-31T05:40:00.000Z","readAt":"2026-12-31T06:00:00.000Z"}],"unread":1}"""
    private val readJson = """{"id":"n1","tripId":"trip_1","lane":"priority","kind":"headcount_call","title":"Head count: Bus A","body":"Kim opened a count.","refType":"headcount","refId":"hc1","createdAt":"2026-12-31T05:52:00.000Z","deliverAt":"2026-12-31T05:52:00.000Z","readAt":"2026-12-31T06:10:00.000Z"}"""
    private val clock: (String) -> String = { iso -> iso.substring(11, 16) }

    @Before fun main() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun reset() = Dispatchers.resetMain()

    private fun client(engine: MockEngine) = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine)

    @Test
    fun sample_mode_reads_without_the_network() {
        val vm = InboxViewModel()
        assertFalse(vm.state.value.live)
        assertEquals("2 unread", vm.state.value.inbox.summary())
        vm.markRead("nt1")
        assertEquals("1 unread", vm.state.value.inbox.summary())
        // A read row stays read; nothing pending in sample mode.
        vm.markRead("nt1")
        assertEquals(1, vm.state.value.inbox.unreadCount())
        assertTrue(vm.state.value.pending.isEmpty())
        assertNull(vm.state.value.notice)
    }

    @Test
    fun live_loads_my_inbox_and_a_read_is_confirmed_or_put_back() = runTest {
        val posts = mutableListOf<String>()
        var fail = false
        val engine = MockEngine { req ->
            when (req.method) {
                HttpMethod.Post -> {
                    posts += req.url.encodedPath
                    if (fail) respond("""{"error":{"code":"NOT_FOUND","message":"x","correlationId":"c"}}""", HttpStatusCode.NotFound, json)
                    else respond(readJson, HttpStatusCode.OK, json)
                }
                else -> respond(inboxJson, HttpStatusCode.OK, json)
            }
        }
        val vm = InboxViewModel(api = client(engine), trip = kim, clock = clock)
        assertTrue(vm.state.value.live)
        assertTrue(vm.state.value.inbox.items.isEmpty())
        vm.ready.join()
        assertEquals("1 unread", vm.state.value.inbox.summary())
        assertEquals(listOf("05:52", "05:40"), vm.state.value.inbox.items.map { it.deliveredAt })

        vm.markRead("n1").join()
        assertEquals("All read", vm.state.value.inbox.summary())
        assertEquals(listOf("/v1/orgs/org_1/trips/trip_1/notifications/n1/read"), posts)
        assertTrue(vm.state.value.pending.isEmpty())

        // A second read of the same row sends nothing.
        vm.markRead("n1").join()
        assertEquals(1, posts.size)

        // A refused read goes back to unread with a notice.
        vm.refresh().join()
        fail = true
        vm.markRead("n1").join()
        assertFalse(vm.state.value.inbox.items[0].read)
        assertEquals("Could not mark it read (NOT_FOUND).", vm.state.value.notice)
    }

    @Test
    fun unreachable_says_offline_on_load_and_keeps_a_local_read() = runTest {
        var reachable = true
        val engine = MockEngine { if (reachable) respond(inboxJson, HttpStatusCode.OK, json) else throw IllegalStateException("offline") }
        val vm = InboxViewModel(api = client(engine), trip = kim, clock = clock)
        vm.ready.join()
        reachable = false
        vm.markRead("n1").join()
        assertTrue(vm.state.value.inbox.items[0].read)
        assertTrue(vm.state.value.inbox.offline)
        assertEquals("Offline. Marked read on this phone only for now.", vm.state.value.notice)

        val cold = InboxViewModel(api = client(MockEngine { throw IllegalStateException("offline") }), trip = kim, clock = clock)
        cold.ready.join()
        assertTrue(cold.state.value.inbox.offline)
        assertEquals("Offline. Showing the last inbox.", cold.state.value.error)
    }

    @Test
    fun device_label_prints_the_time_today_and_the_date_before() {
        val rome = ZoneId.of("Europe/Rome")
        val today = LocalDate.of(2026, 12, 31)
        assertEquals("06:52", InboxViewModel.deviceLabel("2026-12-31T05:52:00.000Z", rome, today))
        assertEquals("12-30 21:05", InboxViewModel.deviceLabel("2026-12-30T20:05:00.000Z", rome, today))
        assertEquals("not-a-time", InboxViewModel.deviceLabel("not-a-time", rome, today))
    }
}
