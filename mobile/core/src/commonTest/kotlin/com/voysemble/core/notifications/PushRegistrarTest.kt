// Copyright 2026- At Day. All rights reserved.
// Facts (D29, slice 088): a signed-in phone registers its token once with PUT /v1/me/push-device
// (iOS carries its APNs environment, Android none); the same token again costs no call; a new
// token registers again; a failed call remembers nothing so the next launch retries; signed out
// nothing is sent; turning notifications off sends DELETE and forgets the token; sign-out forgets
// it with the session.

package com.voysemble.core.notifications

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.session.InMemorySecureStore
import com.voysemble.core.session.SecureStore
import com.voysemble.core.session.SessionManager
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PushRegistrarTest {
    private val jsonHeaders = headersOf(HttpHeaders.ContentType, "application/json")

    private class Seen {
        val calls = mutableListOf<String>()
        val bodies = mutableListOf<String>()
        val auth = mutableListOf<String?>()
    }

    private fun engine(seen: Seen, failRegister: Boolean = false) = MockEngine { req ->
        seen.calls += "${req.method.value} ${req.url.encodedPath}"
        seen.auth += req.headers["Authorization"]
        (req.body as? TextContent)?.let { seen.bodies += it.text }
        when {
            req.url.encodedPath == "/v1/auth/logout" -> respond("""{"loggedOut":true}""", HttpStatusCode.OK, jsonHeaders)
            req.method.value == "DELETE" -> respond("""{"removed":1}""", HttpStatusCode.OK, jsonHeaders)
            failRegister -> respond(
                """{"error":{"code":"VALIDATION_FAILED","message":"Bad token.","correlationId":"c"}}""",
                HttpStatusCode.BadRequest,
                jsonHeaders,
            )
            else -> respond("""{"platform":"ios","registeredAt":"2026-12-31T05:52:00.000Z"}""", HttpStatusCode.OK, jsonHeaders)
        }
    }

    private fun api(engine: MockEngine, store: SecureStore) =
        ApiClient(ApiClientConfig("h", "t") { store.get(SessionManager.KEY_TOKEN) }, engine)

    private fun signedIn(): InMemorySecureStore = InMemorySecureStore().also { it.put(SessionManager.KEY_TOKEN, "tok") }

    @Test
    fun registers_once_and_again_only_for_a_new_token() = runTest {
        val store = signedIn()
        val seen = Seen()
        val push = PushRegistrar(api(engine(seen), store), store)

        assertEquals(PushRegistrar.REGISTERED, push.register("ios", "a1b2c3d4e5f6", "sandbox"))
        assertEquals(listOf("PUT /v1/me/push-device"), seen.calls)
        assertEquals("Bearer tok", seen.auth.single())
        assertEquals("""{"platform":"ios","token":"a1b2c3d4e5f6","apnsEnvironment":"sandbox"}""", seen.bodies.single())
        assertEquals("a1b2c3d4e5f6", push.registeredToken())

        assertEquals(PushRegistrar.UNCHANGED, push.register("ios", "a1b2c3d4e5f6", "sandbox"))
        assertEquals(1, seen.calls.size)

        assertEquals(PushRegistrar.REGISTERED, push.register("ios", "f6e5d4c3b2a1", "sandbox"))
        assertEquals(2, seen.calls.size)
        assertEquals("f6e5d4c3b2a1", push.registeredToken())
    }

    @Test
    fun android_sends_no_apns_environment() = runTest {
        val store = signedIn()
        val seen = Seen()
        PushRegistrar(api(engine(seen), store), store).register("android", "fcm-token-0001", "production")
        assertEquals("""{"platform":"android","token":"fcm-token-0001","apnsEnvironment":null}""", seen.bodies.single())
    }

    @Test
    fun a_failed_call_remembers_nothing_and_signed_out_sends_nothing() = runTest {
        val store = signedIn()
        val seen = Seen()
        val push = PushRegistrar(api(engine(seen, failRegister = true), store), store)
        assertEquals(PushRegistrar.FAILED, push.register("android", "fcm-token-0001", null))
        assertNull(push.registeredToken())

        val out = InMemorySecureStore()
        val quiet = Seen()
        assertEquals(PushRegistrar.SIGNED_OUT, PushRegistrar(api(engine(quiet), out), out).register("android", "fcm-token-0001", null))
        assertTrue(quiet.calls.isEmpty())
    }

    @Test
    fun turning_off_removes_and_sign_out_forgets() = runTest {
        val store = signedIn()
        val seen = Seen()
        val client = api(engine(seen), store)
        val push = PushRegistrar(client, store)
        push.register("ios", "a1b2c3d4e5f6", "production")
        assertEquals(PushRegistrar.REMOVED, push.unregister())
        assertEquals("DELETE /v1/me/push-device", seen.calls.last())
        assertNull(push.registeredToken())

        push.register("ios", "a1b2c3d4e5f6", "production")
        SessionManager(client, store).signOut()
        assertEquals("POST /v1/auth/logout", seen.calls.last())
        assertNull(push.registeredToken())
    }
}
