// Copyright 2026- At Day. All rights reserved.
// Facts: each ApiResult maps to exactly one UI state; no exception escapes to the UI.

package com.voysemble.app.today

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class TodayPlaceholderViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @BeforeTest fun setUp() = Dispatchers.setMain(dispatcher)
    @AfterTest fun tearDown() = Dispatchers.resetMain()

    @Test
    fun reachable_when_health_ok() = runTest(dispatcher) {
        val engine = MockEngine {
            respond(
                """{"status":"ok","service":"voysemble-api","envName":"preview","buildId":"b1","time":"2026-10-10T00:00:00Z"}""",
                HttpStatusCode.OK,
                headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }
        val vm = TodayPlaceholderViewModel("h", engine)
        vm.checkHealth()
        val s = vm.state.first { it !is HealthUiState.Idle && it !is HealthUiState.Loading }
        assertEquals("b1", assertIs<HealthUiState.Reachable>(s).health.buildId)
    }

    @Test
    fun offline_when_transport_fails() = runTest(dispatcher) {
        val vm = TodayPlaceholderViewModel("h", MockEngine { throw IllegalStateException("down") })
        vm.checkHealth()
        val s = vm.state.first { it !is HealthUiState.Idle && it !is HealthUiState.Loading }
        assertIs<HealthUiState.Offline>(s)
    }
}
