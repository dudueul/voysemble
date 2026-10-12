// Copyright 2026- At Day. All rights reserved.
// Facts (D18, slice 044): the list decodes (album present or absent); an upload goes up as
// multipart with the original, the thumbnail and the taken-at time under their field names, with
// the bearer token; the bytes route uses the photo's own path; review, album and delete hit their
// routes with the right bodies and methods.

package com.voysemble.core.api

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.readRemaining
import kotlinx.io.readByteArray
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class MediaTest {
    private val config = ApiClientConfig(host = "test.dev.voysemble.cfd", userAgent = "test", sessionToken = { "tok-1" })
    private val json = headersOf(HttpHeaders.ContentType, "application/json")
    private val photoJson = """{"id":"11111111-1111-4111-8111-111111111111","tripId":"t","uploaderName":"Minji Park","uploaderRole":"traveler","mine":true,"day":4,"takenAt":"2026-12-29T00:30:00.000Z","contentType":"image/jpeg","bytes":1200,"thumbnailBytes":300,"status":"pool","flag":null,"reviewedByName":null,"album":null,"uploadedAt":"2026-12-29T00:31:00.000Z","thumbnailUrl":"/v1/orgs/o/trips/t/media/11111111-1111-4111-8111-111111111111/thumbnail","contentUrl":"/v1/orgs/o/trips/t/media/11111111-1111-4111-8111-111111111111/content"}"""

    @Test
    fun list_decodes_with_and_without_album() {
        val wire = """{"photos":[$photoJson,{"id":"2","tripId":"t","uploaderName":"Kim","uploaderRole":"leader","mine":false,"day":0,"takenAt":"x","contentType":"image/png","bytes":1,"thumbnailBytes":1,"status":"approved","flag":"nudity","reviewedByName":"Kim","album":{"at":"a","byName":"Kim","wholeGroup":true,"participationIds":[],"taggedNames":[]},"uploadedAt":"u","thumbnailUrl":"/t","contentUrl":"/c"}],"counts":{"pool":2,"flagged":0,"approved":1}}"""
        val list = Json { ignoreUnknownKeys = true }.decodeFromString<PhotoListDto>(wire)
        assertEquals(2, list.photos.size)
        assertEquals(null, list.photos[0].album)
        assertEquals(true, list.photos[1].album?.wholeGroup)
        assertEquals(1, list.counts.approved)
    }

    @Test
    fun upload_is_multipart_with_both_renditions_and_the_time() = runTest {
        var contentType: String? = null
        var bodyText = ""
        var auth: String? = null
        val engine = MockEngine { req ->
            assertEquals(HttpMethod.Post, req.method)
            assertEquals("https://test.dev.voysemble.cfd/v1/orgs/o/trips/t/media", req.url.toString())
            auth = req.headers[HttpHeaders.Authorization]
            val body = req.body
            assertIs<MultiPartFormDataContent>(body)
            contentType = body.contentType.toString()
            bodyText = readAll(body).decodeToString()
            respond(photoJson, HttpStatusCode.Created, json)
        }
        val upload = PhotoUpload(original = "ORIGINAL-BYTES".encodeToByteArray(), thumbnail = "THUMB-BYTES".encodeToByteArray(), contentType = "image/jpeg", takenAt = "2026-12-29T09:30:00+09:00")
        val r = ApiClient(config, engine).uploadPhoto("o", "t", upload)
        val ok = assertIs<ApiResult.Ok<PhotoDto>>(r)
        assertEquals("pool", ok.value.status)
        assertEquals("Bearer tok-1", auth)
        assertTrue(contentType!!.startsWith("multipart/form-data"), contentType)
        assertTrue(bodyText.contains("name=\"original\""), bodyText)
        assertTrue(bodyText.contains("filename=\"photo.jpg\""), bodyText)
        assertTrue(bodyText.contains("ORIGINAL-BYTES"))
        assertTrue(bodyText.contains("name=\"thumbnail\""))
        assertTrue(bodyText.contains("THUMB-BYTES"))
        assertTrue(bodyText.contains("name=\"takenAt\""))
        assertTrue(bodyText.contains("2026-12-29T09:30:00+09:00"))
    }

    @Test
    fun bytes_review_album_delete_hit_their_routes() = runTest {
        val seen = mutableListOf<String>()
        val engine = MockEngine { req ->
            seen += "${req.method.value} ${req.url.encodedPath} ${(req.body as? TextContent)?.text ?: ""}".trim()
            when {
                req.url.encodedPath.endsWith("/thumbnail") -> respond(byteArrayOf(1, 2, 3), HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "image/jpeg"))
                req.method == HttpMethod.Delete -> respond("""{"deleted":true,"photoId":"p"}""", HttpStatusCode.OK, json)
                else -> respond(photoJson, HttpStatusCode.OK, json)
            }
        }
        val api = ApiClient(config, engine)
        val bytes = assertIs<ApiResult.Ok<ByteArray>>(api.photoBytes("/v1/orgs/o/trips/t/media/p/thumbnail"))
        assertEquals(listOf<Byte>(1, 2, 3), bytes.value.toList())
        assertIs<ApiResult.Ok<PhotoDto>>(api.reviewPhoto("o", "t", "p", "clear"))
        assertIs<ApiResult.Ok<PhotoDto>>(api.albumPhoto("o", "t", "p", AlbumPhotoRequestDto(wholeGroup = true)))
        assertIs<ApiResult.Ok<DeletePhotoResponseDto>>(api.deletePhoto("o", "t", "p"))
        assertEquals(
            listOf(
                "GET /v1/orgs/o/trips/t/media/p/thumbnail",
                """POST /v1/orgs/o/trips/t/media/p/review {"decision":"clear"}""",
                """PUT /v1/orgs/o/trips/t/media/p/album {"wholeGroup":true,"participationIds":[]}""",
                "DELETE /v1/orgs/o/trips/t/media/p",
            ),
            seen,
        )
    }

    private suspend fun readAll(content: OutgoingContent): ByteArray = when (content) {
        is OutgoingContent.ByteArrayContent -> content.bytes()
        is OutgoingContent.WriteChannelContent -> {
            val channel = io.ktor.utils.io.ByteChannel(autoFlush = true)
            content.writeTo(channel)
            channel.close()
            channel.readRemaining().readByteArray()
        }
        is OutgoingContent.ReadChannelContent -> content.readFrom().readRemaining().readByteArray()
        else -> ByteArray(0)
    }
}
