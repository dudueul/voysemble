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
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
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
    /** Native session token (ADR-0007), read per request so a refreshed token is used at once. */
    public val sessionToken: () -> String? = { null },
)

public class ApiClient(
    private val config: ApiClientConfig,
    engine: HttpClientEngine,
) {
    /**
     * Wire rules: unknown keys are ignored (the server may add fields); nulls and defaults are
     * encoded (`closedAtDevice: null` and `client: "native"` must reach the server: Zod treats a
     * missing nullable key as invalid and a missing `client` as web). Every nullable response field
     * therefore carries a `= null` default so an absent key still decodes.
     */
    private val json: Json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private val http: HttpClient = HttpClient(engine) {
        expectSuccess = false
        install(ContentNegotiation) { json(json) }
    }

    public suspend fun health(correlationId: String? = null): ApiResult<HealthResponse> =
        call(correlationId) { http.get { url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "health") }; header("User-Agent", config.userAgent); correlationId?.let { header(CORRELATION_HEADER, it) } } }

    /** GET /v1/orgs/{orgId}/trips/{tripId}/announcements (visible to the signed-in participant). */
    public suspend fun listAnnouncements(orgId: String, tripId: String, correlationId: String? = null): ApiResult<AnnouncementListDto> =
        call(correlationId) {
            http.get {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "announcements") }
                common(correlationId)
            }
        }

    /** POST .../announcements/{id}/ack. Idempotent server-side; safe to replay from the outbox. */
    public suspend fun ackAnnouncement(
        orgId: String,
        tripId: String,
        announcementId: String,
        ackedAtDevice: String,
        correlationId: String? = null,
    ): ApiResult<AckResponseDto> =
        call(correlationId) {
            http.post {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "announcements", announcementId, "ack") }
                common(correlationId)
                contentType(ContentType.Application.Json)
                setBody(AckRequestDto(ackedAtDevice))
            }
        }

    /** PUT .../headcounts/{id}: the whole device session, idempotent by client id (D14). */
    public suspend fun syncHeadcount(
        orgId: String,
        tripId: String,
        headcountId: String,
        body: SyncHeadcountRequestDto,
        correlationId: String? = null,
    ): ApiResult<SyncHeadcountResponseDto> =
        call(correlationId) {
            http.put {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "headcounts", headcountId) }
                common(correlationId)
                contentType(ContentType.Application.Json)
                setBody(body)
            }
        }

    /** GET .../headcounts: sessions newest first (owner, organizer, participating leader). */
    public suspend fun listHeadcounts(orgId: String, tripId: String, correlationId: String? = null): ApiResult<HeadcountListDto> =
        call(correlationId) {
            http.get {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "headcounts") }
                common(correlationId)
            }
        }

    /** GET .../roster: every participation of the trip (org role leader or above). */
    public suspend fun listRoster(orgId: String, tripId: String, correlationId: String? = null): ApiResult<RosterResponseDto> =
        call(correlationId) {
            http.get {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "roster") }
                common(correlationId)
            }
        }

    /** GET .../incidents: cards the caller may see (staff: all; guardian: own traveler's, projected). */
    public suspend fun listIncidents(orgId: String, tripId: String, correlationId: String? = null): ApiResult<IncidentListDto> =
        call(correlationId) {
            http.get {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "incidents") }
                common(correlationId)
            }
        }

    /** GET .../guardian/status: the guardian's view of their traveler (D13, slice 025). */
    public suspend fun guardianStatus(orgId: String, tripId: String, correlationId: String? = null): ApiResult<GuardianStatusDto> =
        call(correlationId) {
            http.get {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "guardian", "status") }
                common(correlationId)
            }
        }

    /** POST .../incidents/{id}/confirm: the leader's answer (D17). */
    public suspend fun confirmIncident(
        orgId: String,
        tripId: String,
        incidentId: String,
        body: ConfirmIncidentRequestDto,
        correlationId: String? = null,
    ): ApiResult<IncidentDto> =
        call(correlationId) {
            http.post {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "incidents", incidentId, "confirm") }
                common(correlationId)
                contentType(ContentType.Application.Json)
                setBody(body)
            }
        }

    /** GET .../itinerary: the draft for owners and organizers, the latest published revision otherwise. */
    public suspend fun getItinerary(orgId: String, tripId: String, correlationId: String? = null): ApiResult<ItineraryDto> =
        call(correlationId) {
            http.get {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "itinerary") }
                common(correlationId)
            }
        }

    /** POST .../itinerary/proposals: a leader's change proposal (D24); the draft is untouched until accepted. */
    public suspend fun createProposal(
        orgId: String,
        tripId: String,
        body: CreateProposalRequestDto,
        correlationId: String? = null,
    ): ApiResult<ItineraryProposalDto> =
        call(correlationId) {
            http.post {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "itinerary", "proposals") }
                common(correlationId)
                contentType(ContentType.Application.Json)
                setBody(body)
            }
        }

    /** POST /v1/auth/magic-link. Always 202; the server never reveals whether the address exists. */
    public suspend fun requestMagicLink(email: String, locale: String): ApiResult<MagicLinkAcceptedDto> =
        call(null) {
            http.post {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "auth", "magic-link") }
                common(null)
                contentType(ContentType.Application.Json)
                setBody(MagicLinkRequestDto(email, locale))
            }
        }

    /** POST /v1/auth/magic-link/verify with client=native: the session token comes back once. */
    public suspend fun verifyMagicLink(token: String): ApiResult<SessionResponseDto> =
        call(null) {
            http.post {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "auth", "magic-link", "verify") }
                common(null)
                contentType(ContentType.Application.Json)
                setBody(MagicLinkVerifyRequestDto(token))
            }
        }

    public suspend fun me(): ApiResult<MeResponseDto> =
        call(null) { http.get { url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "me") }; common(null) } }

    public suspend fun myParticipations(): ApiResult<MyParticipationListDto> =
        call(null) { http.get { url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "me", "participations") }; common(null) } }

    public suspend fun redeemInvite(code: String): ApiResult<RedeemInviteResponseDto> =
        call(null) {
            http.post {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "invites", "redeem") }
                common(null)
                contentType(ContentType.Application.Json)
                setBody(RedeemInviteRequestDto(code))
            }
        }

    public suspend fun logout(): ApiResult<LogoutResponseDto> =
        call(null) { http.post { url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "auth", "logout") }; common(null) } }

    private fun io.ktor.client.request.HttpRequestBuilder.common(correlationId: String?) {
        header("User-Agent", config.userAgent)
        correlationId?.let { header(CORRELATION_HEADER, it) }
        config.sessionToken()?.let { header("Authorization", "Bearer $it") }
    }

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
