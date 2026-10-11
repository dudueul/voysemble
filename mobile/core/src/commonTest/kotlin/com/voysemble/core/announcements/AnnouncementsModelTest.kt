// Copyright 2026- At Day. All rights reserved.
// Facts: only required, unacknowledged items can be acknowledged; ack queues into the outbox;
// confirm drains it and bumps the count; the fixture has one unacked required item.

package com.voysemble.core.announcements

import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.today.AckState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame

class AnnouncementsModelTest {
    private val feed = KoreaConcertTourFixture.announcements()

    @Test
    fun fixture_has_one_required_unacked_item_with_translation() {
        assertEquals(listOf("an_departure"), feed.unackedRequired.map { it.id })
        assertEquals(true, feed.items.first().machineTranslation?.isNotBlank())
    }

    @Test
    fun acknowledge_queues_pending_then_confirm_completes() {
        val pending = feed.acknowledge("an_departure")
        assertEquals(AckState.PENDING, pending.items.first().ack)
        assertEquals(listOf("an_departure"), pending.outbox)
        assertEquals(emptyList(), pending.unackedRequired)
        val done = pending.confirm("an_departure")
        assertEquals(AckState.ACKNOWLEDGED, done.items.first().ack)
        assertEquals(33, done.items.first().acknowledgedCount)
        assertEquals(emptyList(), done.outbox)
    }

    @Test
    fun invalid_transitions_are_no_ops() {
        assertSame(feed, feed.acknowledge("an_album"))
        assertSame(feed, feed.acknowledge("an_colosseum"))
        assertSame(feed, feed.confirm("an_departure"))
        assertSame(feed, feed.acknowledge("nope"))
    }
}
