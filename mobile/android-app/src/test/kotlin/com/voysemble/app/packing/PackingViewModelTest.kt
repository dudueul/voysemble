// Copyright 2026- At Day. All rights reserved.
// Facts (D38, slice 048): sample mode shows the fixture and ticks without the network; live mode
// loads my list, a tick flips at once and the server's item confirms it, a failed tick goes back
// with a notice, an unreachable server says offline on load and on a tick.

package com.voysemble.app.packing

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.packing.packedCount
import com.voysemble.core.packing.summary
import com.voysemble.core.packing.whose
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
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class PackingViewModelTest {
    private val sora = ActiveTrip("org_1", "Seoul Arts High", "trip_1", "Korea Concert Tour", "p-sora", "guardian")
    private val json = headersOf(HttpHeaders.ContentType, "application/json")
    private val listJson = """{"travelerParticipationId":"p-minji","travelerName":"Minji Park","packingFor":"guardian","items":[{"id":"a","name":"Passport + copy","note":"","packed":true,"packedAt":"2026-12-20T09:00:00.000Z"},{"id":"b","name":"EU plug adapter","note":"Type C or F","packed":false,"packedAt":null}],"packed":1,"total":2}"""

    @Before fun main() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun reset() = Dispatchers.resetMain()

    private fun client(engine: MockEngine) = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine)

    @Test
    fun sample_mode_ticks_without_the_network() {
        val vm = PackingViewModel()
        assertFalse(vm.state.value.live)
        assertEquals("6 of 9 packed", vm.state.value.list.summary())
        assertEquals("Your packing list", vm.state.value.list.whose())
        vm.setPacked("pk7", true)
        assertEquals("7 of 9 packed", vm.state.value.list.summary())
        vm.setPacked("pk1", false)
        assertEquals(6, vm.state.value.list.packedCount())
        assertNull(vm.state.value.notice)
    }

    @Test
    fun live_loads_my_list_and_a_tick_is_confirmed_or_put_back() = runTest {
        val puts = mutableListOf<String>()
        var fail = false
        val engine = MockEngine { req ->
            when {
                req.method == HttpMethod.Put -> {
                    puts += "${req.url.encodedPath} ${(req.body as TextContent).text}"
                    if (fail) respond("""{"error":{"code":"NOT_FOUND","message":"x","correlationId":"c"}}""", HttpStatusCode.NotFound, json)
                    else respond("""{"id":"b","name":"EU plug adapter","note":"Type C or F","packed":true,"packedAt":"2026-12-23T00:00:00.000Z"}""", HttpStatusCode.OK, json)
                }
                else -> respond(listJson, HttpStatusCode.OK, json)
            }
        }
        val vm = PackingViewModel(api = client(engine), trip = sora, nowIso = { "2026-12-23T00:00:00.000Z" })
        assertTrue(vm.state.value.live)
        assertTrue(vm.state.value.list.items.isEmpty())
        vm.ready.join()
        assertEquals("Packing for Minji Park", vm.state.value.list.whose())
        assertEquals("1 of 2 packed", vm.state.value.list.summary())

        vm.setPacked("b", true).join()
        assertEquals("All 2 packed", vm.state.value.list.summary())
        assertEquals("2026-12-23T00:00:00.000Z", vm.state.value.list.items[1].packedAt)
        assertEquals(listOf("""/v1/orgs/org_1/trips/trip_1/packing/b/mine {"packed":true}"""), puts)
        assertTrue(vm.state.value.pending.isEmpty())

        fail = true
        vm.setPacked("a", false).join()
        assertTrue(vm.state.value.list.items[0].packed)
        assertEquals("Could not save the tick (NOT_FOUND).", vm.state.value.notice)
    }

    @Test
    fun unreachable_says_offline_on_load_and_on_a_tick() = runTest {
        val vm = PackingViewModel(api = client(MockEngine { throw IllegalStateException("offline") }), trip = sora)
        vm.ready.join()
        assertTrue(vm.state.value.list.offline)
        assertEquals("Offline. Showing the last list.", vm.state.value.error)
        vm.setPacked("a", true).join()
        assertEquals("Offline. The tick will not reach the organizer until you are connected; try again then.", vm.state.value.notice)
    }
}
