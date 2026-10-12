// Copyright 2026- At Day. All rights reserved.
// Visual evidence for the notification inbox (D29, slice 053): a leader's inbox on the concert
// morning with two unread (the head-count call in the priority lane, the announcement in the
// normal lane), a tap that reads the call, "Open" on a row, and the same inbox all read in the dark theme.

package com.voysemble.app.notifications

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import com.voysemble.app.ui.VoysembleTheme
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.notifications.withRead
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.test.assertEquals

private const val OUT = "../../docs/captures/android"

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w412dp-h915dp-normal-long-notround-any-420dpi-keyshidden-nonav")
class InboxScreenshotTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun inbox_light() {
        val vm = InboxViewModel()
        val opened = mutableListOf<String>()
        compose.setContent { VoysembleTheme(darkTheme = false) { InboxRoute(vm, onBack = {}, onOpen = { opened += it.refType }) } }
        compose.onNodeWithText("2 unread").assertExists()
        compose.onNodeWithText("Head count: Bus A").assertExists()
        compose.onNodeWithText("Head count · 06:52").assertExists()
        // Three rows sit in the priority lane; the first chip is enough.
        compose.onAllNodesWithText("Priority").onFirst().assertExists()
        compose.onRoot().captureRoboImage("$OUT/inbox-light.png")
        // A tap reads the row at once (sample mode: no network).
        compose.onNodeWithContentDescription("Head count: Bus A, unread").performClick()
        compose.onNodeWithText("1 unread").assertExists()
        compose.onNodeWithContentDescription("Head count: Bus A, read").assertExists()
        // Slice 061: "Open" on the head-count row leads to the head count (the caller decides where).
        compose.onNodeWithContentDescription("Open Head count: Bus A").performClick()
        assertEquals(listOf("headcount"), opened)
    }

    @Test
    fun inbox_all_read_dark() {
        val read = KoreaConcertTourFixture.inbox().withRead("nt1").withRead("nt2")
        val vm = InboxViewModel(initial = read)
        compose.setContent { VoysembleTheme(darkTheme = true) { InboxRoute(vm, onBack = {}) } }
        compose.onNodeWithText("All read").assertExists()
        compose.onRoot().captureRoboImage("$OUT/inbox-all-read-dark.png")
    }
}
