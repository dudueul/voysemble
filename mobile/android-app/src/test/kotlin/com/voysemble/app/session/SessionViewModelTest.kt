// Copyright 2026- At Day. All rights reserved.
// Facts: the view model mirrors core SessionState after each call; failures become safe messages
// with the support reference; sample mode is a UI-only flag. Slice 067: with several trips the
// one that matters today is adopted; the switch lists them and rebinds the session.

package com.voysemble.app.session

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.session.InMemorySecureStore
import com.voysemble.core.session.SessionManager
import com.voysemble.core.session.SessionState
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
import kotlin.test.assertIs
import kotlin.test.assertNull

@OptIn(ExperimentalCoroutinesApi::class)
class SessionViewModelTest {
    @Before fun up() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun down() = Dispatchers.resetMain()

    private fun vm(today: String = "2026-10-12", handler: (path: String) -> Pair<String, HttpStatusCode>): SessionViewModel {
        val store = InMemorySecureStore()
        val engine = MockEngine { req ->
            val (body, status) = handler(req.url.encodedPath)
            respond(body, status, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val api = ApiClient(ApiClientConfig("h", "t") { store.get(SessionManager.KEY_TOKEN) }, engine)
        return SessionViewModel(SessionManager(api, store).apply { this.today = { today } })
    }

    @Test
    fun switching_trips_rebinds_the_session() = runTest {
        val winter = """{"organizationId":"org1","organizationName":"Seoul Arts High","tripId":"trip-winter","tripName":"Korea Concert Tour","startsOn":"2026-12-26","endsOn":"2027-01-07","timezone":"Asia/Seoul","participation":{"id":"p1","tripId":"trip-winter","role":"leader","displayName":"Kim","groupName":"Bus A","guardianOf":null,"accountId":"a","createdAt":"x"}}"""
        val spring = """{"organizationId":"org1","organizationName":"Seoul Arts High","tripId":"trip-spring","tripName":"Spring Choir Exchange","startsOn":"2027-03-20","endsOn":"2027-03-27","timezone":"Europe/Rome","participation":{"id":"p2","tripId":"trip-spring","role":"leader","displayName":"Kim","groupName":null,"guardianOf":null,"accountId":"a","createdAt":"x"}}"""
        val vm = vm { path ->
            when (path) {
                "/v1/auth/magic-link/verify" -> """{"accountId":"a","email":"kim@example.com","isNewAccount":false,"expiresAt":"x","sessionToken":"s"}""" to HttpStatusCode.OK
                "/v1/me/participations" -> """{"participations":[$winter,$spring]}""" to HttpStatusCode.OK
                else -> """{"error":{"code":"NOT_FOUND","message":"x","correlationId":"c"}}""" to HttpStatusCode.NotFound
            }
        }
        vm.verify("a".repeat(43)).join()
        // Both trips are ahead of 2026-10-12: the one that starts first is adopted (D42 on the phone).
        assertEquals("trip-winter", assertIs<SessionState.Ready>(vm.state.value.session).trip.tripId)
        assertNull(vm.state.value.choices)
        vm.loadTripChoices().join()
        assertEquals(listOf("trip-winter", "trip-spring"), vm.state.value.choices?.map { it.trip.tripId })
        vm.switchTrip(vm.state.value.choices!![1])
        val ready = assertIs<SessionState.Ready>(vm.state.value.session)
        assertEquals("trip-spring", ready.trip.tripId)
        assertEquals("Spring Choir Exchange", ready.trip.tripName)
        assertEquals("p2", ready.trip.participationId)
    }

    @Test
    fun request_then_verify_reaches_needs_invite() = runTest {
        val vm = vm { path ->
            when (path) {
                "/v1/auth/magic-link" -> """{"accepted":true,"expiresInSeconds":900}""" to HttpStatusCode.Accepted
                "/v1/auth/magic-link/verify" -> """{"accountId":"a","email":"m@example.com","isNewAccount":true,"expiresAt":"x","sessionToken":"s"}""" to HttpStatusCode.OK
                else -> """{"participations":[]}""" to HttpStatusCode.OK
            }
        }
        vm.requestLink("m@example.com").join()
        assertIs<SessionState.AwaitingLink>(vm.state.value.session)
        vm.verify("https://h/auth/verify#token=${"b".repeat(43)}").join()
        assertIs<SessionState.NeedsInvite>(vm.state.value.session)
        assertNull(vm.state.value.error)
    }

    @Test
    fun a_wiped_answer_signs_out_at_once_with_the_notice() = runTest {
        // Slice 031 (D28): the store is signed in on a trip; any call answered with the wipe
        // directive clears it and the route moves to sign-in with the notice.
        val store = InMemorySecureStore()
        store.put(SessionManager.KEY_TOKEN, "tok")
        store.put("session.accountId", "acc")
        store.put("session.email", "m@example.com")
        store.put("active.orgId", "org")
        store.put("active.tripId", "trip")
        store.put("active.participationId", "p")
        val engine = MockEngine {
            respond(
                """{"error":{"code":"SESSION_WIPED","message":"signed out by the organizer","correlationId":"c"}}""",
                HttpStatusCode.Unauthorized,
                headersOf(HttpHeaders.ContentType to listOf("application/json"), "X-Voysemble-Wipe" to listOf("1")),
            )
        }
        val api = ApiClient(ApiClientConfig("h", "t") { store.get(SessionManager.KEY_TOKEN) }, engine)
        val manager = SessionManager(api, store)
        api.onWipe = { manager.wipe() }
        val vm = SessionViewModel(manager)
        assertIs<SessionState.Ready>(vm.state.value.session)
        api.myParticipations()
        assertEquals(SessionState.SignedOut, vm.state.value.session)
        assertEquals(true, vm.state.value.revokedNotice)
        // Requesting a new link clears the notice.
        val vm2 = vm { """{"accepted":true,"expiresInSeconds":900}""" to HttpStatusCode.Accepted }
        vm2.requestLink("m@example.com").join()
        assertEquals(false, vm2.state.value.revokedNotice)
    }

    @Test
    fun expired_link_and_bad_code_show_safe_messages() = runTest {
        val vm = vm { path ->
            when (path) {
                "/v1/auth/magic-link/verify" -> """{"error":{"code":"UNAUTHENTICATED","message":"nope","correlationId":"c1"}}""" to HttpStatusCode.Unauthorized
                else -> """{"error":{"code":"NOT_FOUND","message":"x","correlationId":"c2"}}""" to HttpStatusCode.NotFound
            }
        }
        vm.verify("b".repeat(43)).join()
        assertEquals("This link does not work any more. Request a new one.", vm.state.value.error)
        assertEquals(SessionState.SignedOut, vm.state.value.session)
        vm.verify("garbage").join()
        assertEquals("Paste the whole link from the email.", vm.state.value.error)
        vm.redeem("ZZZZ-ZZZZ").join()
        assertEquals("That code is not valid or has expired.", vm.state.value.error)
        vm.enterSampleMode()
        assertEquals(true, vm.state.value.sampleMode)
        assertNull(vm.state.value.error)
    }
}
