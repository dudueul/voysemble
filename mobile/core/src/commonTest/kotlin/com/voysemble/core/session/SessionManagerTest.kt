// Copyright 2026- At Day. All rights reserved.
// Facts: token extraction accepts a pasted link or a bare token and nothing else; request link
// moves to AwaitingLink; verify stores the native token and adopts an existing participation;
// redeem stores the active trip; sign-out clears everything and calls logout. Slice 067: with
// several trips, verify adopts the one on today, else the next to start, else the one that ended
// last; the switch lists them and makes another the active one.

package com.voysemble.core.session

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.api.ApiResult
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

class SessionManagerTest {
    private val token = "a".repeat(43)

    @Test
    fun extract_token_from_link_or_bare_value() {
        assertEquals(token, extractMagicToken("https://staging.dev.voysemble.cfd/auth/verify#token=$token"))
        assertEquals(token, extractMagicToken("  $token \n"))
        assertNull(extractMagicToken("short"))
        assertNull(extractMagicToken("https://x/auth/verify?token=$token"))
        assertNull(extractMagicToken(""))
    }

    private fun MockRequestHandleScope.json(body: String, status: HttpStatusCode = HttpStatusCode.OK) =
        respond(body, status, headersOf(HttpHeaders.ContentType, "application/json"))

    @Test
    fun full_native_flow_request_verify_redeem_signout() = runTest {
        val store = InMemorySecureStore()
        val seen = mutableListOf<String>()
        var participations = """{"participations":[]}"""
        val engine = MockEngine { req ->
            seen += "${req.method.value} ${req.url.encodedPath} auth=${req.headers[HttpHeaders.Authorization]}"
            when (req.url.encodedPath) {
                "/v1/auth/magic-link" -> json("""{"accepted":true,"expiresInSeconds":900}""", HttpStatusCode.Accepted)
                "/v1/auth/magic-link/verify" -> json("""{"accountId":"acc1","email":"minji@example.com","isNewAccount":true,"expiresAt":"2026-11-10T00:00:00.000Z","sessionToken":"sess-1"}""")
                "/v1/me/participations" -> json(participations)
                "/v1/invites/redeem" -> {
                    participations = """{"participations":[{"organizationId":"org1","organizationName":"Seoul Arts High","tripId":"trip1","tripName":"Korea Concert Tour","participation":{"id":"p1","tripId":"trip1","role":"traveler","displayName":"Minji Park","groupName":"Bus A","guardianOf":null,"accountId":"acc1","createdAt":"2026-10-11T00:00:00.000Z"}}]}"""
                    json("""{"organizationId":"org1","organizationName":"Seoul Arts High","tripId":"trip1","participation":{"id":"p1","tripId":"trip1","role":"traveler","displayName":"Minji Park","groupName":"Bus A","guardianOf":null,"accountId":"acc1","createdAt":"2026-10-11T00:00:00.000Z"}}""")
                }
                "/v1/auth/logout" -> json("""{"loggedOut":true}""")
                else -> json("""{"error":{"code":"NOT_FOUND","message":"x","correlationId":"c"}}""", HttpStatusCode.NotFound)
            }
        }
        val api = ApiClient(ApiClientConfig("test.dev.voysemble.cfd", "test") { store.get(SessionManager.KEY_TOKEN) }, engine)
        val sm = SessionManager(api, store)
        assertEquals(SessionState.SignedOut, sm.current())

        assertIs<ApiResult.Ok<Unit>>(sm.requestLink("Minji@Example.com", "ko"))
        assertEquals(SessionState.AwaitingLink("minji@example.com"), sm.current())

        val verified = assertIs<ApiResult.Ok<SessionState>>(sm.verify("https://host/auth/verify#token=$token"))
        assertEquals(SessionState.NeedsInvite("acc1", "minji@example.com"), verified.value)
        assertEquals("sess-1", store.get(SessionManager.KEY_TOKEN))

        val trip = assertIs<ApiResult.Ok<ActiveTrip>>(sm.redeem("k7px-4mdq")).value
        assertEquals("Korea Concert Tour", trip.tripName)
        assertEquals("p1", trip.participationId)
        val ready = assertIs<SessionState.Ready>(sm.current())
        assertEquals("trip1", ready.trip.tripId)
        // Authenticated calls after verify carry the bearer token.
        assertEquals(true, seen.any { it.startsWith("POST /v1/invites/redeem auth=Bearer sess-1") })

        sm.signOut()
        assertEquals(SessionState.SignedOut, sm.current())
        assertEquals(true, seen.last().startsWith("POST /v1/auth/logout"))
    }

    @Test
    fun several_trips_adopt_by_the_day_and_switch() = runTest {
        val winter = """{"organizationId":"org1","organizationName":"Seoul Arts High","tripId":"trip-winter","tripName":"Korea Concert Tour","startsOn":"2026-12-26","endsOn":"2027-01-07","timezone":"Asia/Seoul","participation":{"id":"p1","tripId":"trip-winter","role":"leader","displayName":"Kim","groupName":"Bus A","guardianOf":null,"accountId":"acc1","createdAt":"x"}}"""
        val spring = """{"organizationId":"org1","organizationName":"Seoul Arts High","tripId":"trip-spring","tripName":"Spring Choir Exchange","startsOn":"2027-03-20","endsOn":"2027-03-27","timezone":"Europe/Rome","participation":{"id":"p2","tripId":"trip-spring","role":"leader","displayName":"Kim","groupName":null,"guardianOf":null,"accountId":"acc1","createdAt":"x"}}"""
        val engine = MockEngine { req ->
            when (req.url.encodedPath) {
                "/v1/auth/magic-link/verify" -> json("""{"accountId":"acc1","email":"kim@example.com","isNewAccount":false,"expiresAt":"x","sessionToken":"sess-1"}""")
                "/v1/me/participations" -> json("""{"participations":[$winter,$spring]}""")
                else -> json("""{"error":{"code":"NOT_FOUND","message":"x","correlationId":"c"}}""", HttpStatusCode.NotFound)
            }
        }
        val store = InMemorySecureStore()
        val sm = SessionManager(ApiClient(ApiClientConfig("h", "t") { store.get(SessionManager.KEY_TOKEN) }, engine), store)
        sm.today = { "2027-02-01" }
        assertIs<ApiResult.Ok<SessionState>>(sm.verify(token))
        // Winter is over, spring is ahead: spring is adopted.
        assertEquals("trip-spring", assertIs<SessionState.Ready>(sm.current()).trip.tripId)
        val choices = assertIs<ApiResult.Ok<TripChoices>>(sm.tripChoices()).value.choices
        assertEquals(listOf("trip-winter", "trip-spring"), choices.map { it.trip.tripId })
        assertEquals("2026-12-26 → 2027-01-07", choices[0].dateLine())
        assertEquals("Leader · Bus A", choices[0].roleLine())
        assertEquals("Leader", choices[1].roleLine())
        assertEquals("Switch to Korea Concert Tour", choices[0].switchSpoken())
        sm.switchTo(choices[0])
        val ready = assertIs<SessionState.Ready>(sm.current())
        assertEquals("trip-winter", ready.trip.tripId)
        assertEquals("Korea Concert Tour", ready.trip.tripName)
        assertEquals("p1", ready.trip.participationId)
        // The rule on its own: on today wins, then the next to start, then the one that ended last.
        assertEquals("trip-winter", defaultChoice(choices, "2026-12-30")?.trip?.tripId)
        assertEquals("trip-winter", defaultChoice(choices, "2026-10-12")?.trip?.tripId)
        assertEquals("trip-spring", defaultChoice(choices, "2027-05-01")?.trip?.tripId)
        assertEquals(null, defaultChoice(emptyList(), "2027-05-01"))
    }

    @Test
    fun bad_token_or_server_failure_leaves_state_unchanged() = runTest {
        val store = InMemorySecureStore()
        val engine = MockEngine { json("""{"error":{"code":"UNAUTHENTICATED","message":"nope","correlationId":"c"}}""", HttpStatusCode.Unauthorized) }
        val sm = SessionManager(ApiClient(ApiClientConfig("h", "t"), engine), store)
        assertIs<ApiResult.Unreachable>(sm.verify("garbage"))
        assertIs<ApiResult.Failed>(sm.verify(token))
        assertEquals(SessionState.SignedOut, sm.current())
    }
}
