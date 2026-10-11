// Copyright 2026- At Day. All rights reserved.
// Facts: the view model mirrors core SessionState after each call; failures become safe messages
// with the support reference; sample mode is a UI-only flag.

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

    private fun vm(handler: (path: String) -> Pair<String, HttpStatusCode>): SessionViewModel {
        val store = InMemorySecureStore()
        val engine = MockEngine { req ->
            val (body, status) = handler(req.url.encodedPath)
            respond(body, status, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val api = ApiClient(ApiClientConfig("h", "t") { store.get(SessionManager.KEY_TOKEN) }, engine)
        return SessionViewModel(SessionManager(api, store))
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
        vm.requestLink("m@example.com")
        assertIs<SessionState.AwaitingLink>(vm.state.value.session)
        vm.verify("https://h/auth/verify#token=${"b".repeat(43)}")
        assertIs<SessionState.NeedsInvite>(vm.state.value.session)
        assertNull(vm.state.value.error)
    }

    @Test
    fun expired_link_and_bad_code_show_safe_messages() = runTest {
        val vm = vm { path ->
            when (path) {
                "/v1/auth/magic-link/verify" -> """{"error":{"code":"UNAUTHENTICATED","message":"nope","correlationId":"c1"}}""" to HttpStatusCode.Unauthorized
                else -> """{"error":{"code":"NOT_FOUND","message":"x","correlationId":"c2"}}""" to HttpStatusCode.NotFound
            }
        }
        vm.verify("b".repeat(43))
        assertEquals("This link does not work any more. Request a new one.", vm.state.value.error)
        assertEquals(SessionState.SignedOut, vm.state.value.session)
        vm.verify("garbage")
        assertEquals("Paste the whole link from the email.", vm.state.value.error)
        vm.redeem("ZZZZ-ZZZZ")
        assertEquals("That code is not valid or has expired.", vm.state.value.error)
        vm.enterSampleMode()
        assertEquals(true, vm.state.value.sampleMode)
        assertNull(vm.state.value.error)
    }
}
