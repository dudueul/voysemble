// Copyright 2026- At Day. All rights reserved.
// Facts (D18, slice 044): sample mode shows the fixture for the leader and the album for a
// guardian without the network; live mode lists on start and fetches thumbnails with the token,
// an upload goes up as multipart with the device-made thumbnail and lands in the feed, a clear
// moves the photo out of the queue, a delete removes it, and an unreachable server says offline.

package com.voysemble.app.memories

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.memories.album
import com.voysemble.core.memories.pool
import com.voysemble.core.memories.queue
import com.voysemble.core.session.ActiveTrip
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
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
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class MemoriesViewModelTest {
    private val kim = ActiveTrip("org_1", "Seoul Arts High", "trip_1", "Korea Concert Tour", "p-kim", "leader")
    private val json = headersOf(HttpHeaders.ContentType, "application/json")
    private fun photo(id: String, status: String, flag: String? = null, mine: Boolean = false) =
        """{"id":"$id","tripId":"trip_1","uploaderName":"Minji Park","uploaderRole":"traveler","mine":$mine,"day":4,"takenAt":"2026-12-29T00:30:00.000Z","contentType":"image/jpeg","bytes":1200,"thumbnailBytes":300,"status":"$status","flag":${flag?.let { "\"$it\"" } ?: "null"},"reviewedByName":null,"album":null,"uploadedAt":"2026-12-29T00:31:00.000Z","thumbnailUrl":"/v1/orgs/org_1/trips/trip_1/media/$id/thumbnail","contentUrl":"/v1/orgs/org_1/trips/trip_1/media/$id/content"}"""

    @Before fun main() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun reset() = Dispatchers.resetMain()

    @Test
    fun sample_mode_for_a_leader_and_for_a_guardian() {
        val leader = MemoriesViewModel()
        assertTrue(!leader.state.value.live)
        assertEquals(1, leader.state.value.feed.queue().size)
        assertEquals(5, leader.state.value.feed.pool().size)
        assertNull(leader.state.value.role)
        val guardian = MemoriesViewModel(sampleRole = "guardian")
        assertEquals("guardian", guardian.state.value.role)
        assertEquals(2, guardian.state.value.feed.album().size)
        leader.upload(listOf(PickedImage(byteArrayOf(1), null)))
        assertEquals("1 uploaded.", leader.state.value.notice)
    }

    @Test
    fun live_lists_fetches_thumbnails_uploads_clears_and_deletes() = runTest {
        val seen = mutableListOf<String>()
        var thumbRequests = 0
        var uploadType: String? = null
        val engine = MockEngine { req ->
            val path = req.url.encodedPath
            seen += "${req.method.value} $path"
            when {
                req.method == HttpMethod.Get && path.endsWith("/media") ->
                    respond("""{"photos":[${photo("f1", "flagged", "nudity")},${photo("p1", "pool")}],"counts":{"pool":1,"flagged":1,"approved":0}}""", HttpStatusCode.OK, json)
                path.endsWith("/thumbnail") -> {
                    thumbRequests += 1
                    assertEquals("Bearer tok", req.headers[HttpHeaders.Authorization])
                    respond(byteArrayOf(9, 9, 9), HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "image/jpeg"))
                }
                req.method == HttpMethod.Post && path.endsWith("/media") -> {
                    uploadType = (req.body as MultiPartFormDataContent).contentType.toString()
                    respond(photo("n1", "pool", mine = true), HttpStatusCode.Created, json)
                }
                path.endsWith("/review") -> respond(photo("f1", "pool", "nudity"), HttpStatusCode.OK, json)
                req.method == HttpMethod.Delete -> respond("""{"deleted":true,"photoId":"n1"}""", HttpStatusCode.OK, json)
                else -> respond("""{"error":{"code":"NOT_FOUND","message":"x","correlationId":"c"}}""", HttpStatusCode.NotFound, json)
            }
        }
        val api = ApiClient(ApiClientConfig("test.dev.voysemble.cfd", "test", sessionToken = { "tok" }), engine)
        val vm = MemoriesViewModel(api = api, trip = kim, prepare = { PreparedImage(it, byteArrayOf(2)) }, decode = { null })
        vm.ready.join()
        assertTrue(vm.state.value.live)
        assertEquals(listOf("f1"), vm.state.value.feed.queue().map { it.id })
        assertEquals(listOf("p1"), vm.state.value.feed.pool().map { it.id })
        assertEquals(2, thumbRequests)
        assertTrue(vm.state.value.thumbnails.containsKey("p1"))

        vm.upload(listOf(PickedImage(byteArrayOf(1, 2, 3), "2026-12-29T09:30:00Z"))).join()
        assertTrue(uploadType!!.startsWith("multipart/form-data"), uploadType)
        assertEquals("1 uploaded.", vm.state.value.notice)
        assertEquals(listOf("n1", "p1"), vm.state.value.feed.pool().map { it.id })
        assertTrue(vm.state.value.feed.pool().first().mine)

        vm.review("f1", "clear").join()
        assertEquals(0, vm.state.value.feed.queue().size)
        assertEquals(listOf("f1", "n1", "p1"), vm.state.value.feed.pool().map { it.id })

        vm.delete("n1").join()
        assertEquals(listOf("f1", "p1"), vm.state.value.feed.pool().map { it.id })
        assertTrue(seen.contains("DELETE /v1/orgs/org_1/trips/trip_1/media/n1"))
    }

    @Test
    fun unreachable_marks_offline_and_an_upload_says_so() = runTest {
        val engine = MockEngine { throw IllegalStateException("no route") }
        val api = ApiClient(ApiClientConfig("test.dev.voysemble.cfd", "test"), engine)
        val vm = MemoriesViewModel(api = api, trip = kim, prepare = { null }, decode = { null })
        vm.ready.join()
        assertTrue(vm.state.value.feed.offline)
        assertEquals("Offline. Showing the last photos.", vm.state.value.error)
        vm.upload(listOf(PickedImage(byteArrayOf(1), null))).join()
        assertEquals("Offline. The photo stays on your phone; try again with a connection.", vm.state.value.notice)
    }
}
