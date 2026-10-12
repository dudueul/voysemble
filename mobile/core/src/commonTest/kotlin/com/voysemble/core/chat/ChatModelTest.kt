// Copyright 2026- At Day. All rights reserved.
// Facts (D22, slice 033): wire channels and messages map with local times; a typed message shows
// at once as pending, is replaced by the server's copy on confirm, or marked failed with its
// text kept for retry; a remote merge keeps local pending and failed messages at the end; the
// unread total sums the channels; the fixture thread is Minji's.

package com.voysemble.core.chat

import com.voysemble.core.api.ChatChannelDto
import com.voysemble.core.api.ChatMessageDto
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ChatModelTest {
    private val clock: (String) -> String = { if (it.startsWith("2026-12-31T06:41")) "06:41" else "07:00" }
    private val wireMsg = ChatMessageDto("s1", "traveler:p1", "Kim", "leader", "Lobby at 07:15.", "2026-12-31T06:41:00.000Z", mine = false)
    private val wireChannel = ChatChannelDto("traveler:p1", "traveler", "Your leaders", "with Kim", 2, wireMsg)

    @Test
    fun wire_shapes_map_with_local_times() {
        val ch = wireChannel.toChatChannel(clock)
        assertEquals(ChatChannel("traveler:p1", "traveler", "Your leaders", "with Kim", 2, "Lobby at 07:15.", "06:41"), ch)
        assertNull(ChatChannelDto("trip", "trip", "Everyone", "x", 0).toChatChannel(clock).lastPreview)
        assertEquals("06:41", wireMsg.toChatMessage(clock).sentAt)
        assertEquals(5, listOf(ch, ch.copy(unread = 3)).unreadTotal())
    }

    @Test
    fun local_send_is_pending_then_confirmed_or_failed() {
        val thread = ChatThread(wireChannel.toChatChannel(clock), listOf(wireMsg.toChatMessage(clock)))
        val pending = thread.appendPending("local-1", "  On my way ", "06:42", "Minji Park", "traveler")
        assertEquals(2, pending.messages.size)
        assertEquals(ChatMessage("local-1", "traveler:p1", "Minji Park", "traveler", "On my way", "06:42", mine = true, pending = true), pending.messages[1])
        val server = ChatMessageDto("s2", "traveler:p1", "Minji Park", "traveler", "On my way", "2026-12-31T06:42:00.000Z", mine = true).toChatMessage(clock)
        val confirmed = pending.confirm("local-1", server)
        assertEquals("s2", confirmed.messages[1].id)
        assertTrue(!confirmed.messages[1].pending)
        val failed = pending.fail("local-1", offline = true)
        assertTrue(failed.messages[1].failed && !failed.messages[1].pending && failed.offline)
        assertEquals("On my way", failed.retryText("local-1"))
        assertNull(confirmed.retryText("s2"))
        assertEquals(1, failed.remove("local-1").messages.size)
    }

    @Test
    fun remote_merge_keeps_local_pending_at_the_end() {
        val thread = ChatThread(wireChannel.toChatChannel(clock), emptyList())
            .appendPending("local-1", "Coming", "06:42", "Minji Park", "traveler")
        val merged = thread.mergeRemote(wireChannel.toChatChannel(clock), listOf(wireMsg.toChatMessage(clock)))
        assertEquals(listOf("s1", "local-1"), merged.messages.map { it.id })
        assertTrue(!merged.offline)
    }

    @Test
    fun fixture_is_minjis_thread() {
        val t = KoreaConcertTourFixture.chatThread()
        assertEquals("Your leaders", t.channel.title)
        assertEquals(4, t.messages.size)
        assertEquals(4, KoreaConcertTourFixture.chats().unreadTotal())
    }
}
