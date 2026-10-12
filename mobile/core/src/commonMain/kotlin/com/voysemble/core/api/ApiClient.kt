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
import io.ktor.client.request.delete
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.request.url
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.URLProtocol
import io.ktor.http.isSuccess
import io.ktor.http.path
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

/** Response header on a wiped session's 401 (D28). */
public const val WIPE_HEADER: String = "X-Voysemble-Wipe"

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

    /**
     * Lost or stolen device (D28): called once per wiped answer (401 with `X-Voysemble-Wipe: 1`
     * or code `SESSION_WIPED`) before the result is returned. The platform wires it to
     * `SessionManager.wipe()`; set after construction so Swift needs no extra constructor argument.
     */
    public var onWipe: (() -> Unit)? = null

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

    /** GET .../windows: meeting windows of the trip (D15, slice 029). */
    public suspend fun listWindows(orgId: String, tripId: String, correlationId: String? = null): ApiResult<WindowListDto> =
        call(correlationId) {
            http.get {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "windows") }
                common(correlationId)
            }
        }

    /** POST .../windows: a leader opens a window; the meeting point travels once, at open. */
    public suspend fun openWindow(orgId: String, tripId: String, body: OpenWindowRequestDto, correlationId: String? = null): ApiResult<MeetingWindowDto> =
        call(correlationId) {
            http.post {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "windows") }
                common(correlationId)
                contentType(ContentType.Application.Json)
                setBody(body)
            }
        }

    /** PUT .../windows/{id}/me: the device's judged state, never a position. */
    public suspend fun reportWindowState(orgId: String, tripId: String, windowId: String, state: String, correlationId: String? = null): ApiResult<ReportWindowStateResponseDto> =
        call(correlationId) {
            http.put {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "windows", windowId, "me") }
                common(correlationId)
                contentType(ContentType.Application.Json)
                setBody(ReportWindowStateRequestDto(state))
            }
        }

    /** POST .../windows/{id}/close: a leader closes the window early. */
    public suspend fun closeWindow(orgId: String, tripId: String, windowId: String, correlationId: String? = null): ApiResult<MeetingWindowDto> =
        call(correlationId) {
            http.post {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "windows", windowId, "close") }
                common(correlationId)
            }
        }

    /** POST .../people/{id}/care-note/reveal: decrypt one care note; the server audits the reveal (D27, slice 030). */
    public suspend fun revealCareNote(orgId: String, tripId: String, participationId: String, correlationId: String? = null): ApiResult<RevealCareNoteResponseDto> =
        call(correlationId) {
            http.post {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "people", participationId, "care-note", "reveal") }
                common(correlationId)
            }
        }

    /** GET .../people/{id}/care-note: is a note on file (staff, the traveler, a bound guardian). */
    public suspend fun careNoteStatus(orgId: String, tripId: String, participationId: String, correlationId: String? = null): ApiResult<CareNoteStatusDto> =
        call(correlationId) {
            http.get {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "people", participationId, "care-note") }
                common(correlationId)
            }
        }

    /** PUT .../people/{id}/care-note: a bound guardian (or the organizer) writes or clears the note (slice 032). */
    public suspend fun putCareNote(orgId: String, tripId: String, participationId: String, note: CareNoteDto, correlationId: String? = null): ApiResult<CareNoteStatusDto> =
        call(correlationId) {
            http.put {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "people", participationId, "care-note") }
                common(correlationId)
                contentType(ContentType.Application.Json)
                setBody(note)
            }
        }

    /** GET .../chats: the caller's channels with unread counts (D22, slice 033). */
    public suspend fun listChats(orgId: String, tripId: String, correlationId: String? = null): ApiResult<ChatChannelListDto> =
        call(correlationId) {
            http.get {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "chats") }
                common(correlationId)
            }
        }

    /** GET .../chats/{channelId}/messages: the latest 200, oldest first; marks the channel read. */
    public suspend fun chatMessages(orgId: String, tripId: String, channelId: String, correlationId: String? = null): ApiResult<ChatMessageListDto> =
        call(correlationId) {
            http.get {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "chats", channelId, "messages") }
                common(correlationId)
            }
        }

    /** POST .../chats/{channelId}/messages. */
    public suspend fun sendChatMessage(orgId: String, tripId: String, channelId: String, body: String, correlationId: String? = null): ApiResult<ChatMessageDto> =
        call(correlationId) {
            http.post {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "chats", channelId, "messages") }
                common(correlationId)
                contentType(ContentType.Application.Json)
                setBody(SendChatMessageRequestDto(body))
            }
        }

    /** DELETE .../chats/{channelId}/messages/{messageId}: own, or any as the channel's moderator (slice 065); the tombstone. */
    public suspend fun removeChatMessage(orgId: String, tripId: String, channelId: String, messageId: String, correlationId: String? = null): ApiResult<ChatMessageDto> =
        call(correlationId) {
            http.delete {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "chats", channelId, "messages", messageId) }
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

    /** POST .../incidents: a card opened by hand from the phone (slice 073). */
    public suspend fun openIncident(orgId: String, tripId: String, body: OpenIncidentRequestDto, correlationId: String? = null): ApiResult<IncidentDto> =
        call(correlationId) {
            http.post {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "incidents") }
                common(correlationId)
                contentType(ContentType.Application.Json)
                setBody(body)
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

    /** POST .../itinerary/proposals with an `add` body (slice 035): the whole event, nulls on the wire. */
    public suspend fun createAddProposal(
        orgId: String,
        tripId: String,
        body: CreateAddProposalRequestDto,
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
    /* ---------- Photos (D18, slice 044) ---------- */

    /** GET .../media: what the signed-in participant may see (ADR-0009), newest first. */
    /** GET .../travel (D37, slice 047): the trip's bookings; a leader gets the buses without the driver's contact. */
    public suspend fun travelPlan(orgId: String, tripId: String, correlationId: String? = null): ApiResult<TravelPlanDto> =
        call(correlationId) {
            http.get {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "travel") }
                common(correlationId)
            }
        }

    /** GET .../travel/{bookingId}/rooming (D41, slice 059): a hotel's rooming list, for leaders. */
    public suspend fun rooming(orgId: String, tripId: String, bookingId: String, correlationId: String? = null): ApiResult<RoomingListDto> =
        call(correlationId) {
            http.get {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "travel", bookingId, "rooming") }
                common(correlationId)
            }
        }

    /** GET .../packing/mine (D38, slice 048): my packing list (a guardian's for their traveler). */
    public suspend fun myPacking(orgId: String, tripId: String, correlationId: String? = null): ApiResult<MyPackingListDto> =
        call(correlationId) {
            http.get {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "packing", "mine") }
                common(correlationId)
            }
        }

    /** PUT .../packing/{itemId}/mine: tick or untick one item. */
    public suspend fun setPacked(orgId: String, tripId: String, itemId: String, packed: Boolean, correlationId: String? = null): ApiResult<MyPackingItemDto> =
        call(correlationId) {
            http.put {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "packing", itemId, "mine") }
                common(correlationId)
                contentType(ContentType.Application.Json)
                setBody(SetPackedRequestDto(packed))
            }
        }

    /** GET .../notifications/mine (D29, slice 053): what the lanes have delivered to me, newest first. */
    public suspend fun myNotifications(orgId: String, tripId: String, correlationId: String? = null): ApiResult<MyNotificationsDto> =
        call(correlationId) {
            http.get {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "notifications", "mine") }
                common(correlationId)
            }
        }

    /** POST .../notifications/{id}/read: mark one of my notifications read; the row comes back. */
    public suspend fun markNotificationRead(orgId: String, tripId: String, notificationId: String, correlationId: String? = null): ApiResult<NotificationDto> =
        call(correlationId) {
            http.post {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "notifications", notificationId, "read") }
                common(correlationId)
            }
        }

    public suspend fun listPhotos(orgId: String, tripId: String, correlationId: String? = null): ApiResult<PhotoListDto> =
        call(correlationId) {
            http.get {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "media") }
                common(correlationId)
            }
        }

    /** The bytes behind a photo's `thumbnailUrl` or `contentUrl` (an API path), with the bearer token. */
    public suspend fun photoBytes(apiPath: String, correlationId: String? = null): ApiResult<ByteArray> =
        call(correlationId) {
            http.get {
                url("https://${config.host}$apiPath")
                common(correlationId)
            }
        }

    /** POST .../media as multipart: the original, the device-made thumbnail (D34), the taken-at time. */
    public suspend fun uploadPhoto(orgId: String, tripId: String, upload: PhotoUpload, correlationId: String? = null): ApiResult<PhotoDto> =
        call(correlationId) {
            val ext = when (upload.contentType) { "image/png" -> "png"; "image/webp" -> "webp"; else -> "jpg" }
            http.post {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "media") }
                common(correlationId)
                setBody(
                    MultiPartFormDataContent(
                        formData {
                            append(
                                "original",
                                upload.original,
                                Headers.build {
                                    append(HttpHeaders.ContentType, upload.contentType)
                                    append(HttpHeaders.ContentDisposition, "filename=\"photo.$ext\"")
                                },
                            )
                            upload.thumbnail?.let { thumb ->
                                append(
                                    "thumbnail",
                                    thumb,
                                    Headers.build {
                                        append(HttpHeaders.ContentType, upload.contentType)
                                        append(HttpHeaders.ContentDisposition, "filename=\"thumbnail.$ext\"")
                                    },
                                )
                            }
                            upload.takenAt?.let { append("takenAt", it) }
                        },
                    ),
                )
            }
        }

    /** POST .../media/{id}/review: a leader clears the flag ("clear") or removes the photo ("remove"). */
    public suspend fun reviewPhoto(orgId: String, tripId: String, photoId: String, decision: String, correlationId: String? = null): ApiResult<PhotoDto> =
        call(correlationId) {
            http.post {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "media", photoId, "review") }
                common(correlationId)
                contentType(ContentType.Application.Json)
                setBody(ReviewPhotoRequestDto(decision))
            }
        }

    /** PUT .../media/{id}/album: into the guardian album with its tags (travelers, or the whole group). */
    public suspend fun albumPhoto(orgId: String, tripId: String, photoId: String, tags: AlbumPhotoRequestDto, correlationId: String? = null): ApiResult<PhotoDto> =
        call(correlationId) {
            http.put {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "media", photoId, "album") }
                common(correlationId)
                contentType(ContentType.Application.Json)
                setBody(tags)
            }
        }

    /** DELETE .../media/{id}: the uploader's own photo, or any for an organizer. */
    public suspend fun deletePhoto(orgId: String, tripId: String, photoId: String, correlationId: String? = null): ApiResult<DeletePhotoResponseDto> =
        call(correlationId) {
            http.delete {
                url { protocol = URLProtocol.HTTPS; host = config.host; path("v1", "orgs", orgId, "trips", tripId, "media", photoId) }
                common(correlationId)
            }
        }

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
            val error = json.decodeFromString<ErrorEnvelope>(text).error
            val wiped = response.status.value == 401 && (response.headers[WIPE_HEADER] == "1" || error.code == "SESSION_WIPED")
            if (wiped) onWipe?.invoke()
            ApiResult.Failed(response.status.value, error, wiped)
        } catch (_: Throwable) {
            ApiResult.Unreachable("non-envelope:${response.status.value}")
        }
    }

    public fun close(): Unit = http.close()

    public companion object {
        public const val CORRELATION_HEADER: String = "X-Correlation-Id"
    }
}
