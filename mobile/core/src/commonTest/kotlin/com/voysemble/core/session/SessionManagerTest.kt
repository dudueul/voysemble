// Copyright 2026- At Day. All rights reserved.
// Facts: token extraction accepts a pasted link or a bare token and nothing else; request link
// moves to AwaitingLink; verify stores the native token and adopts an existing participation;
// redeem stores the active trip; sign-out clears everything and calls logout.

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
        assertEquals(token, extractMagicToken("https://next.dev.voysemble.cfd/auth/verify#token=$token"))
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
    fun bad_token_or_server_failure_leaves_state_unchanged() = runTest {
        val store = InMemorySecureStore()
        val engine = MockEngine { json("""{"error":{"code":"UNAUTHENTICATED","message":"nope","correlationId":"c"}}""", HttpStatusCode.Unauthorized) }
        val sm = SessionManager(ApiClient(ApiClientConfig("h", "t"), engine), store)
        assertIs<ApiResult.Unreachable>(sm.verify("garbage"))
        assertIs<ApiResult.Failed>(sm.verify(token))
        assertEquals(SessionState.SignedOut, sm.current())
    }
}
