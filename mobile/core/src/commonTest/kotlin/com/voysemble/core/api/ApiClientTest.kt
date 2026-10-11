// Copyright 2026- At Day. All rights reserved.
// Facts: health decodes to the contract; ErrorEnvelope becomes Failed; transport failure becomes
// Unreachable; correlation id is sent and echoed. Uses Ktor MockEngine, no network.

package com.voysemble.core.api

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class ApiClientTest {
    private val config = ApiClientConfig(host = "test.dev.voysemble.cfd", userAgent = "test")

    private val healthJson = """
        {"status":"ok","service":"voysemble-api","envName":"preview","buildId":"abc1234","time":"2026-10-10T00:00:00.000Z"}
    """.trimIndent()

    @Test
    fun health_ok_decodes_contract_and_echoes_correlation_id() = runTest {
        var sentCorrelation: String? = null
        val engine = MockEngine { req ->
            sentCorrelation = req.headers[ApiClient.CORRELATION_HEADER]
            assertEquals("https://test.dev.voysemble.cfd/v1/health", req.url.toString())
            respond(
                healthJson,
                HttpStatusCode.OK,
                headersOf(HttpHeaders.ContentType to listOf("application/json"), ApiClient.CORRELATION_HEADER to listOf("corr-1")),
            )
        }
        val result = ApiClient(config, engine).health(correlationId = "corr-1")
        val ok = assertIs<ApiResult.Ok<HealthResponse>>(result)
        assertEquals("ok", ok.value.status)
        assertEquals("preview", ok.value.envName)
        assertEquals("abc1234", ok.value.buildId)
        assertEquals("corr-1", ok.correlationId)
        assertEquals("corr-1", sentCorrelation)
    }

    @Test
    fun error_envelope_becomes_failed_with_code() = runTest {
        val engine = MockEngine {
            respond(
                """{"error":{"code":"NOT_FOUND","message":"No such route.","correlationId":"c-404"}}""",
                HttpStatusCode.NotFound,
                headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }
        val result = ApiClient(config, engine).health()
        val failed = assertIs<ApiResult.Failed>(result)
        assertEquals(404, failed.status)
        assertEquals("NOT_FOUND", failed.error.code)
        assertEquals("c-404", failed.error.correlationId)
    }

    @Test
    fun non_envelope_error_body_is_unreachable_not_crash() = runTest {
        val engine = MockEngine { respond("<html>502</html>", HttpStatusCode.BadGateway) }
        val result = ApiClient(config, engine).health()
        val u = assertIs<ApiResult.Unreachable>(result)
        assertEquals("non-envelope:502", u.reason)
    }

    /** Default-valued fields are encoded: without `client: "native"` the server answers as web and withholds the token. */
    @Test
    fun verify_sends_client_native_explicitly() = runTest {
        var body: String? = null
        val engine = MockEngine { req ->
            body = (req.body as io.ktor.http.content.TextContent).text
            respond(
                """{"accountId":"acc","email":"a@b.c","isNewAccount":false,"expiresAt":"2026-11-01T00:00:00.000Z","sessionToken":"s"}""",
                HttpStatusCode.OK,
                headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }
        val result = ApiClient(config, engine).verifyMagicLink("t".repeat(40))
        assertIs<ApiResult.Ok<SessionResponseDto>>(result)
        assertEquals("""{"token":"${"t".repeat(40)}","client":"native"}""", body)
    }

    @Test
    fun transport_exception_is_unreachable() = runTest {
        val engine = MockEngine { throw IllegalStateException("socket closed") }
        val result = ApiClient(config, engine).health()
        assertIs<ApiResult.Unreachable>(result)
    }
}
