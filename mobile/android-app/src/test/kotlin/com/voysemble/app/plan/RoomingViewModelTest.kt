// Copyright 2026- At Day. All rights reserved.
// Facts (D41, slice 059): sample mode shows the fixture rooms; live mode loads the hotel's list
// from its booking route and reads it by room; a refused list says why; an unreachable server
// says offline and keeps the empty list honest.

package com.voysemble.app.plan

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.session.ActiveTrip
import com.voysemble.core.travel.byRoom
import com.voysemble.core.travel.summary
import com.voysemble.core.travel.unassigned
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
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
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class RoomingViewModelTest {
    private val kim = ActiveTrip("org_1", "Seoul Arts High", "trip_1", "Korea Concert Tour", "p-kim", "leader")
    private val json = headersOf(HttpHeaders.ContentType, "application/json")
    private val listJson = """{"hotel":{"id":"h1","name":"Hotel de la Ville","city":"Rome","checkIn":"2026-12-28","checkOut":"2027-01-02","rooms":21},"people":[{"participationId":"p-kim","displayName":"Kim","role":"leader","groupName":"Bus A","room":"501"},{"participationId":"p-minji","displayName":"Minji Park","role":"traveler","groupName":"Bus A","room":"412"},{"participationId":"p-hana","displayName":"Lee, Hana","role":"traveler","groupName":"Bus B","room":null}],"roomsUsed":2,"assigned":2}"""

    @Before fun main() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun reset() = Dispatchers.resetMain()

    private fun client(engine: MockEngine) = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine)

    @Test
    fun sample_mode_shows_the_fixture_rooms() {
        val vm = RoomingViewModel()
        assertFalse(vm.state.value.live)
        assertEquals("Hotel de la Ville", vm.state.value.rooming.hotelName)
        assertEquals(listOf("412", "415", "501"), vm.state.value.rooming.byRoom().map { it.room })
        assertEquals("4 of 5 placed · 3 of 21 rooms used", vm.state.value.rooming.summary())
    }

    @Test
    fun live_loads_the_hotel_list_from_its_route() = runTest {
        val paths = mutableListOf<String>()
        val engine = MockEngine { req ->
            paths += req.url.encodedPath
            respond(listJson, HttpStatusCode.OK, json)
        }
        val vm = RoomingViewModel(api = client(engine), trip = kim, bookingId = "h1", hotelName = "Hotel de la Ville")
        assertTrue(vm.state.value.live)
        vm.ready.join()
        assertEquals(listOf("/v1/orgs/org_1/trips/trip_1/travel/h1/rooming"), paths)
        val r = vm.state.value.rooming
        assertEquals(listOf("412" to listOf("Minji Park"), "501" to listOf("Kim")), r.byRoom().map { it.room to it.names })
        assertEquals(listOf("Lee, Hana"), r.unassigned())
        assertEquals("2 of 3 placed · 2 of 21 rooms used", r.summary())
        assertFalse(vm.state.value.syncing)
    }

    @Test
    fun refused_says_why_and_unreachable_says_offline() = runTest {
        val refused = RoomingViewModel(
            api = client(MockEngine { respond("""{"error":{"code":"FORBIDDEN","message":"no","correlationId":"c"}}""", HttpStatusCode.Forbidden, json) }),
            trip = kim,
            bookingId = "h1",
            hotelName = "Hotel de la Ville",
        )
        refused.ready.join()
        assertEquals("Could not load the rooms (FORBIDDEN).", refused.state.value.error)
        val cold = RoomingViewModel(api = client(MockEngine { throw IllegalStateException("offline") }), trip = kim, bookingId = "h1", hotelName = "Hotel de la Ville")
        cold.ready.join()
        assertTrue(cold.state.value.rooming.offline)
        assertEquals("Offline. Showing the last list.", cold.state.value.error)
        assertEquals("Hotel de la Ville", cold.state.value.rooming.hotelName)
    }
}
