// Copyright 2026- At Day. All rights reserved.
// Facts: acknowledging moves the announcement to PENDING once; tab selection is reflected; live
// mode builds today's snapshot from the published itinerary for the device date and clock, and an
// unreachable server marks the snapshot offline. Slice 074: a traveler asks for help (the POST
// names only them; the card tracks the server's answer); sample mode keeps a local card. Slice
// 075: a traveler's room tonight rides on the refresh; the sample shows Minji's. Slice 086: a
// leader's Today reads today's newest head count per group; a traveler's shows no head count card.
// Slice 087: an answer is kept in the offline pack; a restart with no signal opens Today from it.

package com.voysemble.app.today

import com.voysemble.core.session.InMemorySecureStore
import com.voysemble.core.offline.OfflinePack
import com.voysemble.core.today.HeadcountGroup
import com.voysemble.core.today.MyRoomCard
import com.voysemble.core.today.HelpStatus
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.api.CareNoteDto
import com.voysemble.core.session.ActiveTrip
import com.voysemble.core.today.AckState
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

    private val announcementsJson = """
        {"announcements":[
          {"id":"r2","tripId":"trip_1","title":"Itinerary updated","body":"The itinerary was updated: 1 change.","requiresAck":true,"sharedWithGuardians":true,"authorName":"Organizer","publishedAt":"2026-12-30T22:10:00.000Z","ackTotal":4,"ackCount":1,"myAck":"unacknowledged","translation":null,"kind":"itinerary_revision","revision":{"revision":2,"fromRevision":1,"added":0,"changed":1,"removed":0,"changes":[]}},
          {"id":"a1","tripId":"trip_1","title":"Old","body":"x","requiresAck":true,"sharedWithGuardians":false,"authorName":"Organizer","publishedAt":"2026-12-29T10:00:00.000Z","ackTotal":4,"ackCount":4,"myAck":"acknowledged","translation":null,"kind":"announcement","revision":null}
        ]}
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
    fun a_traveler_asks_for_help_from_today() = runTest {
        val minji = ActiveTrip("org_1", "Hana", "trip_1", "Korea Concert Tour 2026", "p-minji", "traveler")
        val posts = mutableListOf<String>()
        val card = """{"id":"i9","tripId":"trip_1","kind":"help","status":"open","title":"I feel sick","headcountId":null,
            "people":[{"participationId":"p-minji","displayName":"Minji Park","groupName":"Bus A"}],
            "openedAt":"2026-12-30T22:12:00.000Z","openedByName":"Minji Park","resolvedAt":null,"resolvedByName":null,"resolutionNote":null,"confirmations":[],"guardianMessage":null}"""
        val engine = MockEngine { req ->
            val json = headersOf(HttpHeaders.ContentType, "application/json")
            when {
                req.url.encodedPath.endsWith("/incidents") && req.method == HttpMethod.Post -> {
                    posts += (req.body as TextContent).text
                    respond(card, HttpStatusCode.Created, json)
                }
                req.url.encodedPath.endsWith("/incidents") -> respond(if (posts.isEmpty()) """{"incidents":[]}""" else """{"incidents":[$card]}""", HttpStatusCode.OK, json)
                req.url.encodedPath.endsWith("/rooming/mine") -> respond("""{"stay":{"hotelName":"Hotel de la Ville","city":"Rome","checkIn":"2026-12-28","checkOut":"2027-01-02","room":"412","roommates":["Juho Kim"]}}""", HttpStatusCode.OK, json)
                req.url.encodedPath.endsWith("/announcements") -> respond(announcementsJson, HttpStatusCode.OK, json)
                else -> respond(itineraryJson, HttpStatusCode.OK, json)
            }
        }
        val vm = TodayViewModel(api = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine), trip = minji, deviceDate = { "2026-12-31" }, deviceClock = { "08:00" })
        vm.ready.join()
        assertTrue(vm.state.value.canAskHelp)
        assertNull(vm.state.value.help)
        // Slice 075: the room rides on the refresh.
        assertEquals(MyRoomCard("Hotel de la Ville", "412", listOf("Juho Kim"), "2027-01-02"), vm.state.value.room)
        vm.askHelp("  I feel sick ").join()
        assertEquals(listOf("""{"title":"I feel sick","participationIds":["p-minji"]}"""), posts)
        assertEquals("I feel sick", vm.state.value.help?.title)
        assertEquals(HelpStatus.OPEN, vm.state.value.help?.status)
        assertNull(vm.state.value.helpError)
        assertTrue(!vm.state.value.helpSending)
        // A refresh keeps the card from the server's list; no words sends the default title.
        vm.refresh().join()
        assertEquals("I feel sick", vm.state.value.help?.title)
        assertNull(vm.state.value.help?.answeredBy)
        vm.askHelp("   ").join()
        assertEquals("""{"title":"Asked for help","participationIds":["p-minji"]}""", posts[1])
        // Sample mode: a local card at the fixture's clock; a leader's trip has no card.
        val sample = TodayViewModel()
        assertTrue(sample.state.value.canAskHelp)
        assertEquals("412", sample.state.value.room?.room)
        sample.askHelp("")
        assertEquals("Asked for help", sample.state.value.help?.title)
        assertEquals("07:12", sample.state.value.help?.openedAt)
        assertTrue(!TodayViewModel(api = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine), trip = trip).state.value.canAskHelp)
    }

    @Test
    fun a_leaders_today_reads_todays_head_counts() = runTest {
        val sessions = """{"headcounts":[
            {"id":"h2","tripId":"trip_1","groupName":"Bus A","openedByName":"Kim","openedAtDevice":"14:50","closedAtDevice":"14:58","receivedAt":"2026-12-31T05:58:00.000Z","expected":20,"present":18,"accounted":19,"missing":[],"closedWithMissing":false},
            {"id":"h1","tripId":"trip_1","groupName":"Bus A","openedByName":"Kim","openedAtDevice":"09:00","closedAtDevice":"09:10","receivedAt":"2026-12-31T00:10:00.000Z","expected":20,"present":12,"accounted":12,"missing":[],"closedWithMissing":true},
            {"id":"h0","tripId":"trip_1","groupName":"Bus B","openedByName":"Lee","openedAtDevice":"20:00","closedAtDevice":"20:05","receivedAt":"2026-12-30T11:05:00.000Z","expected":18,"present":18,"accounted":18,"missing":[],"closedWithMissing":false}
        ]}"""
        val engine = MockEngine { req ->
            val json = headersOf(HttpHeaders.ContentType, "application/json")
            when {
                req.url.encodedPath.endsWith("/headcounts") -> respond(sessions, HttpStatusCode.OK, json)
                req.url.encodedPath.endsWith("/announcements") -> respond(announcementsJson, HttpStatusCode.OK, json)
                req.url.encodedPath.endsWith("/rooming/mine") -> respond("""{"stay":null}""", HttpStatusCode.OK, json)
                else -> respond(itineraryJson, HttpStatusCode.OK, json)
            }
        }
        val vm = TodayViewModel(api = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine), trip = trip, deviceDate = { "2026-12-31" }, deviceClock = { "15:00" })
        vm.ready.join()
        // Today in Seoul is Dec 31: the newer Bus A count (19 of 20), not the morning one; Bus B's was yesterday.
        assertTrue(vm.state.value.showsHeadcount)
        assertEquals(listOf(HeadcountGroup("Bus A", 19, 20)), vm.state.value.snapshot.headcount)
        // A traveler's Today carries no head count card.
        val minji = ActiveTrip("org_1", "Hana", "trip_1", "Korea Concert Tour 2026", "p-minji", "traveler")
        assertTrue(!TodayViewModel(api = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine), trip = minji).state.value.showsHeadcount)
        assertTrue(TodayViewModel().state.value.showsHeadcount)
    }

    @Test
    fun a_restart_with_no_signal_opens_today_from_the_pack() = runTest {
        val store = InMemorySecureStore()
        val online = MockEngine { req ->
            val json = headersOf(HttpHeaders.ContentType, "application/json")
            when {
                req.url.encodedPath.endsWith("/announcements") -> respond(announcementsJson, HttpStatusCode.OK, json)
                req.url.encodedPath.endsWith("/headcounts") -> respond("""{"headcounts":[]}""", HttpStatusCode.OK, json)
                req.url.encodedPath.endsWith("/rooming/mine") -> respond("""{"stay":null}""", HttpStatusCode.OK, json)
                else -> respond(itineraryJson, HttpStatusCode.OK, json)
            }
        }
        val first = TodayViewModel(api = ApiClient(ApiClientConfig("h", "t") { "tok" }, online), trip = trip, deviceDate = { "2026-12-31" }, deviceClock = { "08:00" }, pack = OfflinePack(store), nowMillis = { 0L })
        first.ready.join()
        assertEquals(2, first.state.value.snapshot.events.size)
        // Two hours later, no signal: Today opens with the packed plan, then says it is offline.
        val offline = MockEngine { throw java.io.IOException("no route to host") }
        val second = TodayViewModel(api = ApiClient(ApiClientConfig("h", "t") { "tok" }, offline), trip = trip, deviceDate = { "2026-12-31" }, deviceClock = { "10:00" }, pack = OfflinePack(store), nowMillis = { 128 * 60_000L })
        second.ready.join()
        val s = second.state.value.snapshot
        assertEquals(listOf("Breakfast", "Depart"), s.events.map { it.title })
        assertEquals(128, s.minutesSinceSync)
        assertTrue(s.offline)
    }

    @Test
    fun live_builds_today_from_the_published_itinerary() = runTest {
        val acks = mutableListOf<String>()
        val engine = MockEngine { req ->
            when {
                req.url.encodedPath.endsWith("/ack") -> { acks += req.url.encodedPath; respond("""{"announcementId":"r2","participationId":"p","created":true,"ackedAtDevice":"x","receivedAt":"y"}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json")) }
                req.url.encodedPath.endsWith("/announcements") -> respond(announcementsJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
                else -> respond(itineraryJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            }
        }
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
        // Slice 020: the latest unacknowledged required-ack announcement rides on Today; ack posts once.
        assertEquals("r2", s.snapshot.announcement?.id)
        assertEquals(AckState.UNACKNOWLEDGED, s.snapshot.announcement?.ack)
        vm.acknowledge("r2").join()
        assertEquals(listOf("/v1/orgs/org_1/trips/trip_1/announcements/r2/ack"), acks)
        assertEquals(AckState.ACKNOWLEDGED, vm.state.value.snapshot.announcement?.ack)
        assertEquals(2, vm.state.value.snapshot.announcement?.acknowledgedCount)
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

    @Test
    fun propose_posts_edit_and_lands_on_sent() = runTest {
        val posts = mutableListOf<String>()
        val engine = MockEngine { req ->
            if (req.method == HttpMethod.Post) {
                posts += (req.body as TextContent).text
                assertEquals("/v1/orgs/org_1/trips/trip_1/itinerary/proposals", req.url.encodedPath)
                respond(
                    """{"id":"11111111-1111-4111-8111-111111111111","tripId":"trip_1","kind":"edit","eventId":"e1","eventTitle":"Breakfast","patch":{"start":"07:00"},"note":"Earlier.","status":"pending","proposedByName":"Kim","proposedAt":"2026-12-31T06:00:00.000Z","decidedAt":null,"decidedByName":null,"decisionNote":null}""",
                    HttpStatusCode.Created,
                    headersOf(HttpHeaders.ContentType, "application/json"),
                )
            } else {
                respond(itineraryJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            }
        }
        val vm = TodayViewModel(api = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine), trip = trip, deviceDate = { "2026-12-31" }, deviceClock = { "06:00" })
        vm.ready.join()
        vm.propose("e1", "07:00", " Earlier. ").join()
        assertEquals(listOf("""{"kind":"edit","eventId":"e1","patch":{"start":"07:00"},"note":"Earlier."}"""), posts)
        assertTrue(vm.state.value.proposal?.sent == true)
        assertNull(vm.state.value.proposal?.error)
        vm.dismissProposal()
        assertNull(vm.state.value.proposal)
    }

    @Test
    fun propose_refused_shows_safe_message_and_sample_mode_sends_nothing() = runTest {
        val engine = MockEngine { req ->
            if (req.method == HttpMethod.Post) {
                respond("""{"error":{"code":"FORBIDDEN","message":"no","correlationId":"c"}}""", HttpStatusCode.Forbidden, headersOf(HttpHeaders.ContentType, "application/json"))
            } else {
                respond(itineraryJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            }
        }
        val vm = TodayViewModel(api = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine), trip = trip, deviceDate = { "2026-12-31" }, deviceClock = { "06:00" })
        vm.ready.join()
        vm.propose("e1", null, "Why").join()
        assertEquals("Only trip leaders propose changes.", vm.state.value.proposal?.error)

        val sample = TodayViewModel()
        sample.propose("ev_2", null, "Why").join()
        assertTrue(sample.state.value.proposal?.sent == true)
    }

    @Test
    fun live_guardian_gets_the_traveler_card_instead_of_head_counts() = runTest {
        val guardianJson = """{"traveler":{"participationId":"p1","displayName":"Minji Park","groupName":"Bus A"},
          "count":{"status":"present","headcountId":"hc1","groupLabel":"Bus A","closed":false,"atDevice":"06:52","byName":"Kim","receivedAt":"2026-12-31T05:52:00.000Z"},
          "incident":null,"itineraryRevision":1}"""
        val paths = mutableListOf<String>()
        val engine = MockEngine { req ->
            paths += req.url.encodedPath
            when {
                req.url.encodedPath.endsWith("/guardian/status") -> respond(guardianJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
                req.url.encodedPath.endsWith("/announcements") -> respond(announcementsJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
                else -> respond(itineraryJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            }
        }
        val vm = TodayViewModel(
            api = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine),
            trip = trip.copy(participationId = "p-sora", role = "guardian"),
            deviceDate = { "2026-12-31" },
            deviceClock = { "08:00" },
            locale = "en",
        )
        vm.ready.join()
        val s = vm.state.value
        assertEquals("Counted present", s.guardian?.headline)
        assertEquals("Bus A · 06:52 · by Kim", s.guardian?.detail)
        assertEquals("Minji Park", s.guardian?.travelerName)
        assertTrue(paths.any { it.endsWith("/guardian/status") })
        // A leader never asks for it.
        val leader = TodayViewModel(api = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine), trip = trip, deviceDate = { "2026-12-31" }, deviceClock = { "08:00" })
        paths.clear()
        leader.ready.join()
        assertNull(leader.state.value.guardian)
        assertTrue(paths.none { it.endsWith("/guardian/status") })
    }

    @Test
    fun guardian_writes_the_care_note_from_today() = runTest {
        // Slice 032 (D27): the status loads with the card; Add starts blank; Save PUTs the three
        // fields to the traveler's care route and the status follows; Edit reveals to prefill.
        val guardianJson = """{"traveler":{"participationId":"p1","displayName":"Minji Park","groupName":"Bus A"},
          "count":{"status":"present","headcountId":"hc1","groupLabel":"Bus A","closed":false,"atDevice":"06:52","byName":"Kim","receivedAt":"2026-12-31T05:52:00.000Z"},
          "incident":null,"itineraryRevision":1}"""
        var stored: String? = null
        val puts = mutableListOf<String>()
        val engine = MockEngine { req ->
            val path = req.url.encodedPath
            when {
                path.endsWith("/guardian/status") -> respond(guardianJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
                path.endsWith("/announcements") -> respond(announcementsJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
                path.endsWith("/care-note/reveal") -> respond(
                    """{"participationId":"p1","note":$stored,"updatedAt":"2026-12-31T06:00:00.000Z","updatedByName":"Sora Park","revealedAt":"2026-12-31T06:01:00.000Z"}""",
                    HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"),
                )
                path.endsWith("/care-note") && req.method == HttpMethod.Put -> {
                    val body = (req.body as TextContent).text
                    puts += body
                    assertEquals("/v1/orgs/org_1/trips/trip_1/people/p1/care-note", path)
                    stored = body
                    respond("""{"participationId":"p1","hasCareNote":true,"updatedAt":"2026-12-31T06:00:00.000Z","updatedByName":"Sora Park","reveals":0}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
                }
                path.endsWith("/care-note") -> respond(
                    if (stored == null) """{"participationId":"p1","hasCareNote":false,"updatedAt":null,"updatedByName":null,"reveals":0}"""
                    else """{"participationId":"p1","hasCareNote":true,"updatedAt":"2026-12-31T06:00:00.000Z","updatedByName":"Sora Park","reveals":0}""",
                    HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"),
                )
                else -> respond(itineraryJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            }
        }
        val vm = TodayViewModel(
            api = ApiClient(ApiClientConfig("h", "t") { "tok" }, engine),
            trip = trip.copy(participationId = "p-sora", role = "guardian"),
            deviceDate = { "2026-12-31" },
            deviceClock = { "08:00" },
            locale = "en",
        )
        vm.ready.join()
        assertEquals(false, vm.state.value.care?.status?.hasCareNote)
        vm.editCare().join()
        assertEquals(CareNoteDto(), vm.state.value.care?.draft)
        vm.saveCare(CareNoteDto("Peanuts", "EpiPen in the red bag", "")).join()
        assertEquals(listOf("""{"allergies":"Peanuts","medications":"EpiPen in the red bag","freeText":""}"""), puts)
        assertEquals(true, vm.state.value.care?.status?.hasCareNote)
        assertNull(vm.state.value.care?.draft)
        assertEquals("Care note saved. Leaders of Bus A can reveal it.", vm.state.value.care?.message)
        vm.editCare().join()
        assertEquals("Peanuts", vm.state.value.care?.draft?.allergies)
    }
}
