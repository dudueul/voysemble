// Copyright 2026- At Day. All rights reserved.
// Facts (D28, slice 031): a 401 carrying the wipe header or the SESSION_WIPED code marks the
// result wiped and fires the client's hook once; the session manager's wipe clears every key,
// keeps the revoked notice for the sign-in screen, and notifies the platform; a new link request
// clears the notice; an ordinary 401 does none of this.

package com.voysemble.core.session

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.api.ApiResult
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SessionWipeTest {
    private fun client(engine: MockEngine, store: SecureStore) =
        ApiClient(ApiClientConfig("h", "t") { store.get(SessionManager.KEY_TOKEN) }, engine)

    @Test
    fun wiped_answer_clears_the_session_and_keeps_the_notice() = runTest {
        val store = InMemorySecureStore()
        store.put(SessionManager.KEY_TOKEN, "tok")
        store.put("session.accountId", "acc")
        store.put("active.orgId", "org")
        val engine = MockEngine {
            respond(
                """{"error":{"code":"SESSION_WIPED","message":"This device was signed out by the organizer.","correlationId":"c"}}""",
                HttpStatusCode.Unauthorized,
                headersOf(HttpHeaders.ContentType to listOf("application/json"), "X-Voysemble-Wipe" to listOf("1")),
            )
        }
        val api = client(engine, store)
        val manager = SessionManager(api, store)
        var notified = 0
        manager.onWiped = { notified += 1 }
        api.onWipe = { manager.wipe() }
        val r = api.myParticipations()
        assertTrue(r is ApiResult.Failed && r.wiped)
        assertEquals(1, notified)
        assertNull(store.get(SessionManager.KEY_TOKEN))
        assertNull(store.get("active.orgId"))
        assertEquals(SessionState.SignedOut, manager.current())
        assertTrue(manager.revokedNotice())
    }

    @Test
    fun the_code_alone_is_enough_and_a_plain_401_is_not_a_wipe() = runTest {
        val store = InMemorySecureStore()
        var status = "SESSION_WIPED"
        val engine = MockEngine {
            respond("""{"error":{"code":"$status","message":"x","correlationId":"c"}}""", HttpStatusCode.Unauthorized, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val api = client(engine, store)
        var wipes = 0
        api.onWipe = { wipes += 1 }
        assertTrue((api.myParticipations() as ApiResult.Failed).wiped)
        assertEquals(1, wipes)
        status = "UNAUTHENTICATED"
        assertFalse((api.myParticipations() as ApiResult.Failed).wiped)
        assertEquals(1, wipes)
    }

    @Test
    fun a_new_link_request_clears_the_notice() = runTest {
        val store = InMemorySecureStore()
        store.put(SessionManager.KEY_REVOKED_NOTICE, "1")
        val engine = MockEngine { respond("""{"accepted":true,"expiresInSeconds":900}""", HttpStatusCode.Accepted, headersOf(HttpHeaders.ContentType, "application/json")) }
        val manager = SessionManager(client(engine, store), store)
        assertTrue(manager.revokedNotice())
        manager.requestLink("minji@example.com", "ko")
        assertFalse(manager.revokedNotice())
    }
}
