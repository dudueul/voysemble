// Copyright 2026- At Day. All rights reserved.
//
// Thin HTTP client over the Voysemble API. Owns: base URL, JSON config, correlation id header,
// error envelope decoding. Must not: hold secrets in code, retry blindly, or throw for expected
// server errors. Auth headers are attached by a later slice through `headers`.

package com.voysemble.core.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.URLProtocol
import io.ktor.http.isSuccess
import io.ktor.http.path
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

public class ApiClientConfig(
    /** e.g. "next.dev.voysemble.cfd" or "api.voysemble.com". Scheme is always https. */
    public val host: String,
    public val userAgent: String,
)

public class ApiClient(
    private val config: ApiClientConfig,
    engine: HttpClientEngine,
) {
    private val json: Json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    private val http: HttpClient = HttpClient(engine) {
        expectSuccess = false
        install(ContentNegotiation) { json(json) }
    }

    public suspend fun health(correlationId: String? = null): ApiResult<HealthResponse> =
        call(correlationId) { http.get { url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "health") }; header("User-Agent", config.userAgent); correlationId?.let { header(CORRELATION_HEADER, it) } } }

    private suspend inline fun <reified T> call(
        correlationId: String?,
        request: () -> HttpResponse,
    ): ApiResult<T> {
        val response = try {
            request()
        } catch (t: Throwable) {
            return ApiResult.Unreachable(t::class.simpleName ?: "unknown")
        }
        val corr = response.headers[CORRELATION_HEADER] ?: correlationId
        if (response.status.isSuccess()) {
            return try {
                ApiResult.Ok(response.body<T>(), corr)
            } catch (t: Throwable) {
                ApiResult.Unreachable("decode:${t::class.simpleName}")
            }
        }
        val text = response.bodyAsText()
        return try {
            ApiResult.Failed(response.status.value, json.decodeFromString<ErrorEnvelope>(text).error)
        } catch (_: Throwable) {
            ApiResult.Unreachable("non-envelope:${response.status.value}")
        }
    }

    public fun close(): Unit = http.close()

    public companion object {
        public const val CORRELATION_HEADER: String = "X-Correlation-Id"
    }
}
