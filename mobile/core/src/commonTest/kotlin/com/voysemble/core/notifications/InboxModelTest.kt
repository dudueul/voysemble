// Copyright 2026- At Day. All rights reserved.
// Facts (D29, slice 053): the wire inbox becomes the phone's with the platform's clock labels; a
// read flips one row locally and the server's row replaces it; the summary and the bell count the
// unread in both languages; unknown lanes and kinds read as normal announcements; the fixture has
// five rows, two unread.

package com.voysemble.core.notifications

import com.voysemble.core.api.MyNotificationsDto
import com.voysemble.core.api.NotificationDto
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.i18n.AppLocale
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class InboxModelTest {
    @AfterTest
    fun reset() {
        AppLocale.current = "en"
    }

    private val dto = MyNotificationsDto(
        notifications = listOf(
            NotificationDto("n1", "t1", "priority", "headcount_call", "Head count: Bus A", "Kim opened a count.", "headcount", "hc1", "2026-12-31T05:52:00.000Z", "2026-12-31T05:52:00.000Z", readAt = null),
            NotificationDto("n2", "t1", "normal", "announcement", "Call time 17:30", "Lobby by 17:20.", "announcement", "an2", "2026-12-31T05:40:00.000Z", "2026-12-31T05:40:00.000Z", readAt = null),
            NotificationDto("n3", "t1", "digest", "itinerary_revision", "Plan updated", "", "announcement", "an3", "2026-12-30T20:05:00.000Z", "2026-12-31T06:30:00.000Z", readAt = "2026-12-31T06:40:00.000Z"),
        ),
        unread = 2,
    )

    private val clock: (String) -> String = { iso -> iso.substring(11, 16) }

    @Test
    fun wire_to_inbox_reads_and_summary() {
        val inbox = inboxOf(dto, clock)
        assertEquals(listOf("05:52", "05:40", "06:30"), inbox.items.map { it.deliveredAt })
        assertEquals(listOf(Lane.PRIORITY, Lane.NORMAL, Lane.DIGEST), inbox.items.map { it.lane })
        assertEquals(InboxKind.ITINERARY_REVISION, inbox.items[2].kind)
        assertEquals(2, inbox.unreadCount())
        assertEquals("2 unread", inbox.summary())
        assertEquals("Priority · Head count · 05:52", inbox.items[0].meta())
        assertEquals("Head count: Bus A, unread", inbox.items[0].spoken())
        assertEquals("Plan updated, read", inbox.items[2].spoken())
        assertEquals("Inbox, 2 unread", bellSpoken(2))
        val read = inbox.withRead("n1")
        assertTrue(read.items[0].read)
        assertEquals("1 unread", read.summary())
        val fromServer = read.replaceItem(inboxItemOf(dto.notifications[1].copy(readAt = "2026-12-31T06:50:00.000Z"), clock))
        assertEquals("All read", fromServer.summary())
        assertEquals("Nothing yet", emptyInbox().summary())
        assertTrue(emptyInbox().withOffline(true).offline)
        assertFalse(inbox.offline)
    }

    @Test
    fun unknown_wire_values_read_as_a_normal_announcement() {
        val item = inboxItemOf(dto.notifications[0].copy(lane = "later", kind = "weather"), clock)
        assertEquals(Lane.NORMAL, item.lane)
        assertEquals(InboxKind.ANNOUNCEMENT, item.kind)
        assertEquals("Normal · Announcement · 05:52", item.meta())
        // Slice 056: the packing reminder is its own kind.
        val reminder = inboxItemOf(dto.notifications[0].copy(kind = "packing_reminder", title = "Packing: 3 days to go"), clock)
        assertEquals(InboxKind.PACKING_REMINDER, reminder.kind)
        assertEquals("Priority · Packing · 05:52", reminder.meta())
    }

    @Test
    fun fixture_and_korean() {
        val fixture = KoreaConcertTourFixture.inbox()
        assertEquals(5, fixture.items.size)
        assertEquals("2 unread", fixture.summary())
        assertEquals(listOf(InboxKind.HEADCOUNT_CALL, InboxKind.ANNOUNCEMENT, InboxKind.ITINERARY_REVISION, InboxKind.PROPOSAL_DECIDED, InboxKind.INCIDENT_STATUS), fixture.items.map { it.kind })
        AppLocale.current = "ko"
        assertEquals("안 읽음 2개", fixture.summary())
        assertEquals("우선 · 인원 점검 · 06:52", fixture.items[0].meta())
        assertEquals("받은 알림, 안 읽음 2개", bellSpoken(2))
        assertEquals("모두 읽음", fixture.withRead("nt1").withRead("nt2").summary())
    }
}
