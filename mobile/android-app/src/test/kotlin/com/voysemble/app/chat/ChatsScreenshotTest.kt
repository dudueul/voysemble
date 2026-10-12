// Copyright 2026- At Day. All rights reserved.
// Visual evidence for the Chats tab (D22, slice 033): the channel list with badges, and Minji's
// thread with a pending message.

package com.voysemble.app.chat

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import com.voysemble.app.ui.VoysembleTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onFirst

private const val OUT = "../../docs/captures/android"

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w412dp-h915dp-normal-long-notround-any-420dpi-keyshidden-nonav")
class ChatsScreenshotTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun chats_list_light() {
        val vm = ChatsViewModel()
        compose.setContent { VoysembleTheme(darkTheme = false) { ChatsRoute(vm) } }
        compose.onNodeWithText("4 unread").assertExists()
        compose.onNodeWithText("Your leaders").assertExists()
        compose.onRoot().captureRoboImage("$OUT/chats-list.png")
    }

    @Test
    fun chats_thread_with_pending_dark() {
        val vm = ChatsViewModel(deviceClock = { "06:45" })
        compose.setContent { VoysembleTheme(darkTheme = true) { ChatsRoute(vm) } }
        compose.onNodeWithContentDescription("Open chat Your leaders").performClick()
        compose.onNodeWithText("We leave at 07:15, be in the lobby.").assertExists()
        compose.onNodeWithContentDescription("Message").performTextInput("On my way!")
        compose.onNodeWithText("Send").performClick()
        compose.onNodeWithText("Sending…").assertExists()
        // Slice 065: Minji removes her own first message; the bubble says so.
        compose.onAllNodesWithContentDescription("Remove message from Minji Park").onFirst().performClick()
        compose.onNodeWithText("Removed by Minji Park").assertExists()
        compose.onRoot().captureRoboImage("$OUT/chats-thread-dark.png")
    }
}
