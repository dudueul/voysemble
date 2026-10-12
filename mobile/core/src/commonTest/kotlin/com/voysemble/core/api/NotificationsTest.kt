// Copyright 2026- At Day. All rights reserved.
// Facts (D29, slice 053): my inbox decodes as the Worker sends it, an unread row with a null readAt.

package com.voysemble.core.api

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class NotificationsTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun decodes_my_inbox() {
        val inbox = json.decodeFromString<MyNotificationsDto>(
            """{"notifications":[{"id":"n1","tripId":"t1","lane":"priority","kind":"headcount_call","title":"Head count: Bus A","body":"Kim opened a count.","refType":"headcount","refId":"hc1","createdAt":"2026-12-31T05:52:00.000Z","deliverAt":"2026-12-31T05:52:00.000Z","readAt":null},{"id":"n2","tripId":"t1","lane":"digest","kind":"itinerary_revision","title":"Plan updated","body":"","refType":"announcement","refId":"an3","createdAt":"2026-12-30T20:05:00.000Z","deliverAt":"2026-12-31T06:30:00.000Z","readAt":"2026-12-31T06:40:00.000Z","extra":1}],"unread":1}""",
        )
        assertEquals(2, inbox.notifications.size)
        assertEquals(1, inbox.unread)
        assertNull(inbox.notifications[0].readAt)
        assertEquals("digest", inbox.notifications[1].lane)
        assertEquals("2026-12-31T06:30:00.000Z", inbox.notifications[1].deliverAt)
    }
}
