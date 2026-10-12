// Copyright 2026- At Day. All rights reserved.
// Facts (slice 035): sample mode shows the fixture plan on its own day and "sends" without the
// network; live mode builds the plan from the published itinerary and opens the device date's
// day; an unreachable server marks the plan offline; a leader's remove and add proposals post
// the core bodies; 403 is explained; travelers cannot propose; an incomplete draft says why.
// Slice 047 (D37): a leader's plan loads the bookings after the itinerary; a traveler never asks.

package com.voysemble.app.plan

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.plan.ProposalDraft
import com.voysemble.core.plan.ProposalKind
import com.voysemble.core.session.ActiveTrip
import com.voysemble.core.travel.bookingsOn
import com.voysemble.core.travel.detail
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
class PlanViewModelTest {
    private val kim = ActiveTrip("org_1", "Hana", "trip_1", "Korea Concert Tour 2026", "p-kim", "leader")
    private val minji = ActiveTrip("org_1", "Hana", "trip_1", "Korea Concert Tour 2026", "p-minji", "traveler")
    private val json = headersOf(HttpHeaders.ContentType, "application/json")

    private val itineraryJson = """
        {"tripId":"trip_1","tripName":"Korea Concert Tour 2026","startDate":"2026-12-26","endDate":"2027-01-07","revision":2,
         "publishedAt":"2026-12-20T00:00:00.000Z","view":"published",
         "days":[{"date":"2026-12-26","timeZone":"Asia/Seoul","label":"Day 1"},{"date":"2026-12-31","timeZone":"Asia/Seoul","label":"Concert"}],
         "events":[
           {"id":"e1","tripId":"trip_1","date":"2026-12-31","start":"07:30","end":"08:15","timeZone":"Asia/Seoul","kind":"meal","title":"Breakfast","place":"Hotel","pax":null,"status":"scheduled","note":null,"order":1,"published":true},
           {"id":"e2","tripId":"trip_1","date":"2026-12-31","start":"09:00","end":null,"timeZone":"Asia/Seoul","kind":"bus","title":"Depart","place":"Lobby","pax":null,"status":"scheduled","note":"Blue flag","order":4,"published":true}
         ],"unpublished":0}
    """.trimIndent()

    private val travelJson = """{"flights":[{"id":"f1","tripId":"trip_1","kind":"flight","code":"DEMO 901","from":"ICN","to":"FCO","departsAt":"2026-12-28T13:30","arrivesAt":"2026-12-28T18:55","pax":42,"pnr":"VYS8K2","status":"delayed","createdAt":"2026-10-12T00:00:00.000Z"}],"hotels":[{"id":"h1","tripId":"trip_1","kind":"hotel","name":"Hotel de la Ville","city":"Rome","checkIn":"2026-12-28","checkOut":"2027-01-02","rooms":21,"confirmation":"","nights":5,"createdAt":"2026-10-12T00:00:00.000Z"}],"buses":[{"id":"b1","tripId":"trip_1","kind":"bus","label":"Bus A","company":"Roma Coach","seats":24,"driverContact":null,"groups":["Bus A"],"assigned":2,"createdAt":"2026-10-12T00:00:00.000Z"}],"groups":["Bus A","Bus B"],"travelers":3}"""

    private val proposalJson = """{"id":"11111111-1111-4111-8111-111111111111","tripId":"trip_1","kind":"remove","eventId":"e1","eventTitle":"Breakfast","patch":{},"note":"x","status":"pending","proposedByName":"Kim","proposedAt":"2026-12-31T06:00:00.000Z","decidedAt":null,"decidedByName":null,"decisionNote":null}"""

    @Before fun main() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun reset() = Dispatchers.resetMain()

    private fun client(engine: MockEngine) = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine)

    @Test
    fun sample_mode_shows_the_fixture_on_its_day_and_sends_nothing() = runTest {
        val vm = PlanViewModel()
        assertFalse(vm.state.value.live)
        assertTrue(vm.state.value.canPropose)
        assertEquals(4, vm.state.value.plan.days.size)
        assertEquals("Concert day", vm.state.value.plan.days[vm.state.value.selected].label)
        vm.selectDay(0)
        assertEquals("Arrival", vm.state.value.plan.days[vm.state.value.selected].label)
        vm.selectDay(99)
        assertEquals(3, vm.state.value.selected)
        vm.propose(ProposalDraft(ProposalKind.REMOVE, "ev_5", "Rained out")).join()
        assertTrue(vm.state.value.proposal?.sent == true)
        assertEquals(ProposalKind.REMOVE, vm.state.value.proposal?.kind)
        vm.dismissProposal()
        assertNull(vm.state.value.proposal)
        // Sample mode shows the fixture bookings to the leader view (slice 047).
        assertTrue(vm.state.value.canSeeTravel)
        assertEquals(2, vm.state.value.travel?.buses?.size)
    }

    @Test
    fun leader_loads_the_bookings_after_the_itinerary_and_a_traveler_never_asks() = runTest {
        val paths = mutableListOf<String>()
        val engine = MockEngine { req ->
            paths += req.url.encodedPath
            if (req.url.encodedPath.endsWith("/travel")) respond(travelJson, HttpStatusCode.OK, json) else respond(itineraryJson, HttpStatusCode.OK, json)
        }
        val vm = PlanViewModel(api = client(engine), trip = kim, deviceDate = { "2026-12-31" })
        assertTrue(vm.state.value.canSeeTravel)
        vm.ready.join()
        val travel = vm.state.value.travel ?: error("bookings not loaded; requests: $paths")
        assertEquals(listOf("DEMO 901"), travel.flights.map { it.code })
        val arrival = travel.bookingsOn("2026-12-28")
        assertEquals(1, arrival.flights.size)
        assertEquals("Check-in today · 5 nights · Rome · 21 rooms", arrival.hotels.single().detail())
        assertEquals("Roma Coach · 2 of 24 seats · Groups: Bus A", arrival.buses.single().detail())
        // The bookings came after the itinerary, from the plan route.
        val travelPath = "/v1/orgs/org_1/trips/trip_1/travel"
        assertTrue(paths.contains(travelPath), "requests: $paths")
        assertTrue(paths.indexOf("/v1/orgs/org_1/trips/trip_1/itinerary") < paths.indexOf(travelPath), "requests: $paths")

        // A traveler never asks for the bookings: no new travel request, nothing in the state.
        val travelRequests = paths.count { it == travelPath }
        val traveler = PlanViewModel(api = client(engine), trip = minji, deviceDate = { "2026-12-31" })
        traveler.ready.join()
        assertFalse(traveler.state.value.canSeeTravel)
        assertNull(traveler.state.value.travel)
        assertEquals(travelRequests, paths.count { it == travelPath }, "requests: $paths")
    }

    @Test
    fun live_builds_the_plan_and_opens_the_device_date() = runTest {
        val engine = MockEngine { respond(itineraryJson, HttpStatusCode.OK, json) }
        val vm = PlanViewModel(api = client(engine), trip = kim, deviceDate = { "2026-12-31" })
        assertTrue(vm.state.value.live)
        // The state before the first answer is not asserted: the mock may answer before this line
        // runs (the Unconfined main dispatcher resumes on the engine's thread). CI run 38280896774.
        vm.ready.join()
        val s = vm.state.value
        assertEquals(listOf("Day 1", "Concert"), s.plan.days.map { it.label })
        assertEquals(1, s.selected)
        assertEquals(listOf("Breakfast", "Depart"), s.plan.days[1].events.map { it.title })
        assertEquals(5, s.plan.days[1].nextOrder)
        assertFalse(s.syncing)
        assertNull(s.error)
        // A refresh keeps the reader's day.
        vm.selectDay(0)
        vm.refresh().join()
        assertEquals(0, vm.state.value.selected)
    }

    @Test
    fun live_unreachable_marks_offline() = runTest {
        val vm = PlanViewModel(api = client(MockEngine { throw IllegalStateException("offline") }), trip = kim, deviceDate = { "2026-12-31" })
        vm.ready.join()
        assertTrue(vm.state.value.plan.offline)
        assertNull(vm.state.value.travel)
        assertEquals("Korea Concert Tour 2026", vm.state.value.plan.tripName)
        vm.propose(ProposalDraft(ProposalKind.REMOVE, "e1", "Why")).join()
        assertEquals("Offline. Try again when connected.", vm.state.value.proposal?.error)
    }

    @Test
    fun leader_remove_and_add_post_the_core_bodies_and_403_is_explained() = runTest {
        val posts = mutableListOf<String>()
        var status = HttpStatusCode.Created
        val engine = MockEngine { req ->
            if (req.method == HttpMethod.Post) {
                posts += (req.body as TextContent).text
                assertEquals("/v1/orgs/org_1/trips/trip_1/itinerary/proposals", req.url.encodedPath)
                if (status == HttpStatusCode.Forbidden) {
                    respond("""{"error":{"code":"FORBIDDEN","message":"no","correlationId":"c"}}""", status, json)
                } else {
                    respond(proposalJson, status, json)
                }
            } else {
                respond(itineraryJson, HttpStatusCode.OK, json)
            }
        }
        val vm = PlanViewModel(api = client(engine), trip = kim, deviceDate = { "2026-12-31" })
        vm.ready.join()
        vm.propose(ProposalDraft(ProposalKind.REMOVE, "e1", " Rained out ")).join()
        assertTrue(vm.state.value.proposal?.sent == true)
        val day = vm.state.value.plan.days[1]
        vm.propose(ProposalDraft(ProposalKind.ADD, null, "A treat", start = "18:00", title = "Gelato", place = "Giolitti", date = day.date, timeZone = day.timeZone, order = day.nextOrder)).join()
        assertTrue(vm.state.value.proposal?.sent == true)
        assertEquals(
            listOf(
                """{"kind":"remove","eventId":"e1","patch":{},"note":"Rained out"}""",
                """{"kind":"add","eventId":null,"patch":{"date":"2026-12-31","start":"18:00","end":null,"timeZone":"Asia/Seoul","kind":"activity","title":"Gelato","place":"Giolitti","pax":null,"status":"scheduled","note":null,"order":5},"note":"A treat"}""",
            ),
            posts,
        )
        // An incomplete draft never reaches the network.
        vm.propose(ProposalDraft(ProposalKind.ADD, null, "A treat", start = "", title = "Gelato", date = day.date, timeZone = day.timeZone)).join()
        assertEquals("The start must be HH:mm.", vm.state.value.proposal?.error)
        assertEquals(2, posts.size)
        status = HttpStatusCode.Forbidden
        vm.propose(ProposalDraft(ProposalKind.EDIT, "e1", "Why", start = "07:00")).join()
        assertEquals("Only trip leaders propose changes.", vm.state.value.proposal?.error)
    }

    @Test
    fun travelers_read_only() = runTest {
        val vm = PlanViewModel(api = client(MockEngine { respond(itineraryJson, HttpStatusCode.OK, json) }), trip = minji, deviceDate = { "2026-12-31" })
        vm.ready.join()
        assertFalse(vm.state.value.canPropose)
    }
}
