// Copyright 2026- At Day. All rights reserved.
// Facts (D22, slice 033): sample mode lists the fixture channels and opens Minji's thread without
// the network; live mode lists on start, opening a channel fetches its messages and zeroes its
// badge, a send shows at once as pending and becomes the server's copy, an unreachable send
// stays as failed and retry sends it again; 403 on a channel is explained. Slice 065: removing a
// message asks the server and shows its tombstone; sample mode removes locally.

package com.voysemble.app.chat

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.session.ActiveTrip
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
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
class ChatsViewModelTest {
    private val minji = ActiveTrip("org_1", "Seoul Arts High", "trip_1", "Korea Concert Tour", "p-minji", "traveler")
    private val json = headersOf(HttpHeaders.ContentType, "application/json")
    private val leadersChannel = """{"id":"traveler:p-minji","kind":"traveler","title":"Your leaders","subtitle":"with Kim","unread":1,
        "lastMessage":{"id":"s1","channelId":"traveler:p-minji","senderName":"Kim","senderRole":"leader","body":"Lobby at 07:15.","sentAt":"2026-12-31T06:41:00.000Z","mine":false}}"""
    private val listJson = """{"channels":[{"id":"trip","kind":"trip","title":"Everyone on the trip","subtitle":"3 travelers · 1 leaders · the organizer","unread":0,"lastMessage":null},$leadersChannel]}"""

    @Before fun main() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun reset() = Dispatchers.resetMain()

    @Test
    fun sample_mode_lists_the_fixture_and_opens_minjis_thread() {
        val vm = ChatsViewModel()
        assertTrue(!vm.state.value.live)
        assertEquals(listOf("trip", "group:Bus A", "traveler:t1"), vm.state.value.channels.map { it.id })
        vm.open("traveler:t1")
        assertEquals(4, vm.state.value.open?.messages?.size)
        vm.send("On my way")
        assertEquals(5, vm.state.value.open?.messages?.size)
        assertTrue(vm.state.value.open?.messages?.last()?.pending == true)
        vm.close()
        assertNull(vm.state.value.open)
    }

    @Test
    fun live_lists_opens_sends_and_retries() = runTest {
        var online = true
        val posts = mutableListOf<String>()
        val engine = MockEngine { req ->
            if (!online) throw IllegalStateException("no route")
            val path = req.url.encodedPath
            when {
                path.endsWith("/chats") -> respond(listJson, HttpStatusCode.OK, json)
                req.method == HttpMethod.Post -> {
                    posts += (req.body as TextContent).text
                    // Ktor may leave ':' bare in a path segment or encode it; the server accepts both.
                    assertTrue(path == "/v1/orgs/org_1/trips/trip_1/chats/traveler:p-minji/messages" || path == "/v1/orgs/org_1/trips/trip_1/chats/traveler%3Ap-minji/messages", path)
                    respond(
                        """{"id":"s2","channelId":"traveler:p-minji","senderName":"Minji Park","senderRole":"traveler","body":"On my way","sentAt":"2026-12-31T06:42:00.000Z","mine":true}""",
                        HttpStatusCode.Created, json,
                    )
                }
                else -> respond(
                    """{"channel":${leadersChannel.replace("\"unread\":1", "\"unread\":0")},"messages":[{"id":"s1","channelId":"traveler:p-minji","senderName":"Kim","senderRole":"leader","body":"Lobby at 07:15.","sentAt":"2026-12-31T06:41:00.000Z","mine":false}]}""",
                    HttpStatusCode.OK, json,
                )
            }
        }
        val vm = ChatsViewModel(ApiClient(ApiClientConfig("h", "t") { "tok" }, engine), minji, deviceClock = { "06:42" }, newId = { "local-1" }, tickMs = Long.MAX_VALUE, senderName = "Minji Park")
        vm.ready.join()
        assertTrue(vm.state.value.live)
        assertEquals(listOf("trip", "traveler:p-minji"), vm.state.value.channels.map { it.id })
        assertEquals(1, vm.state.value.channels[1].unread)
        vm.open("traveler:p-minji").join()
        assertEquals(0, vm.state.value.channels[1].unread)
        assertEquals(listOf("s1"), vm.state.value.open?.messages?.map { it.id })
        vm.send("On my way").join()
        assertEquals(listOf("""{"body":"On my way"}"""), posts)
        assertEquals(listOf("s1", "s2"), vm.state.value.open?.messages?.map { it.id })
        assertTrue(vm.state.value.open?.messages?.last()?.pending == false)
        // Offline: the message stays as failed; retry sends it once back online.
        online = false
        vm.send("Still here").join()
        val failed = vm.state.value.open?.messages?.last()
        assertTrue(failed?.failed == true && failed.body == "Still here")
        assertTrue(vm.state.value.open?.offline == true)
        online = true
        vm.retry("local-1").join()
        assertEquals(2, posts.size)
        assertEquals(listOf("s1", "s2", "s2"), vm.state.value.open?.messages?.map { it.id })
    }

    @Test
    fun removing_a_message_leaves_a_tombstone() = runTest {
        val deletes = mutableListOf<String>()
        val engine = MockEngine { req ->
            val path = req.url.encodedPath
            when {
                path.endsWith("/chats") -> respond(listJson, HttpStatusCode.OK, json)
                req.method == HttpMethod.Delete -> {
                    deletes += path
                    respond(
                        """{"id":"s1","channelId":"traveler:p-minji","senderName":"Kim","senderRole":"leader","body":"","sentAt":"2026-12-31T06:41:00.000Z","mine":false,"removed":{"byName":"Kim","at":"2026-12-31T06:50:00.000Z"}}""",
                        HttpStatusCode.OK, json,
                    )
                }
                else -> respond(
                    """{"channel":${leadersChannel.replace("\"unread\":1", "\"unread\":0")},"messages":[{"id":"s1","channelId":"traveler:p-minji","senderName":"Kim","senderRole":"leader","body":"Lobby at 07:15.","sentAt":"2026-12-31T06:41:00.000Z","mine":false}]}""",
                    HttpStatusCode.OK, json,
                )
            }
        }
        val kim = ActiveTrip("org_1", "Seoul Arts High", "trip_1", "Korea Concert Tour", "p-kim", "leader")
        val vm = ChatsViewModel(ApiClient(ApiClientConfig("h", "t") { "tok" }, engine), kim, tickMs = Long.MAX_VALUE, senderName = "Kim")
        vm.ready.join()
        assertEquals("leader", vm.role)
        vm.open("traveler:p-minji").join()
        assertEquals("Lobby at 07:15.", vm.state.value.open?.messages?.first()?.body)
        vm.remove("s1").join()
        assertTrue(deletes.single().endsWith("/messages/s1"), deletes.toString())
        val m = vm.state.value.open?.messages?.first()
        assertEquals("", m?.body)
        assertEquals("Kim", m?.removedBy)
        assertNull(vm.state.value.error)
        // Sample mode: the person's own message, locally, named by its sender.
        val sample = ChatsViewModel()
        sample.open("traveler:t1")
        sample.remove("m1")
        assertEquals("Minji Park", sample.state.value.open?.messages?.first()?.removedBy)
        assertEquals("", sample.state.value.open?.messages?.first()?.body)
    }

    @Test
    fun a_channel_the_person_is_not_in_is_explained() = runTest {
        val engine = MockEngine { req ->
            if (req.url.encodedPath.endsWith("/chats")) respond(listJson, HttpStatusCode.OK, json)
            else respond("""{"error":{"code":"FORBIDDEN","message":"Not a member of this channel.","correlationId":"c"}}""", HttpStatusCode.Forbidden, json)
        }
        val vm = ChatsViewModel(ApiClient(ApiClientConfig("h", "t") { "tok" }, engine), minji, tickMs = Long.MAX_VALUE)
        vm.ready.join()
        vm.open("trip").join()
        assertEquals("You are not in this channel.", vm.state.value.error)
    }
}
