// Copyright 2026- At Day. All rights reserved.
// Facts: acknowledging moves the announcement to PENDING once; tab selection is reflected; live
// mode builds today's snapshot from the published itinerary for the device date and clock, and an
// unreachable server marks the snapshot offline.

package com.voysemble.app.today

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.session.ActiveTrip
import com.voysemble.core.today.AckState
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
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class TodayViewModelTest {
    private val trip = ActiveTrip("org_1", "Hana", "trip_1", "Korea Concert Tour 2026", "p-kim", "leader")

    private val itineraryJson = """
        {"tripId":"trip_1","tripName":"Korea Concert Tour 2026","startDate":"2026-12-26","endDate":"2027-01-07","revision":1,
         "publishedAt":"2026-12-20T00:00:00.000Z","view":"published",
         "days":[{"date":"2026-12-26","timeZone":"Asia/Seoul","label":"Day 1"},{"date":"2026-12-31","timeZone":"Asia/Seoul","label":"Day 6"}],
         "events":[
           {"id":"e1","tripId":"trip_1","date":"2026-12-31","start":"07:30","end":"08:15","timeZone":"Asia/Seoul","kind":"meal","title":"Breakfast","place":"Hotel","pax":null,"status":"scheduled","note":null,"order":1,"published":true},
           {"id":"e2","tripId":"trip_1","date":"2026-12-31","start":"09:00","end":null,"timeZone":"Asia/Seoul","kind":"bus","title":"Depart","place":"Lobby","pax":null,"status":"scheduled","note":"Blue flag","order":2,"published":true}
         ],"unpublished":0}
    """.trimIndent()

    @Before fun main() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun reset() = Dispatchers.resetMain()

    @Test
    fun acknowledge_queues_once() {
        val vm = TodayViewModel()
        vm.acknowledge("an_departure")
        vm.acknowledge("an_departure")
        assertEquals(AckState.PENDING, vm.state.value.snapshot.announcement?.ack)
        assertEquals(32, vm.state.value.snapshot.announcement?.acknowledgedCount)
    }

    @Test
    fun select_tab() {
        val vm = TodayViewModel()
        vm.selectTab(MainTab.PLAN)
        assertEquals(MainTab.PLAN, vm.state.value.tab)
    }

    @Test
    fun live_builds_today_from_the_published_itinerary() = runTest {
        val engine = MockEngine { respond(itineraryJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json")) }
        val vm = TodayViewModel(
            api = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine),
            trip = trip,
            deviceDate = { "2026-12-31" },
            deviceClock = { "08:00" },
        )
        vm.ready.join()
        val s = vm.state.value
        assertTrue(s.live)
        assertTrue(!s.syncing)
        assertEquals("Korea Concert Tour 2026", s.snapshot.tripName)
        assertEquals(6, s.snapshot.dayNumber)
        assertEquals("Thursday, Dec 31", s.snapshot.dateLabel)
        assertEquals("Seoul", s.snapshot.timeZoneLabel)
        assertEquals(listOf("Breakfast", "Depart"), s.snapshot.events.map { it.title })
        assertEquals("e1", s.snapshot.upNext?.id) // breakfast ends 08:15, still on at 08:00
        assertEquals(0, s.snapshot.minutesSinceSync)
    }

    @Test
    fun live_unreachable_marks_offline() = runTest {
        val vm = TodayViewModel(
            api = ApiClient(ApiClientConfig("h", "t") { "tok" }, MockEngine { throw IllegalStateException("offline") }),
            trip = trip,
            deviceDate = { "2026-12-31" },
            deviceClock = { "08:00" },
        )
        vm.ready.join()
        assertTrue(vm.state.value.snapshot.offline)
        assertEquals("Korea Concert Tour 2026", vm.state.value.snapshot.tripName)
    }
}
