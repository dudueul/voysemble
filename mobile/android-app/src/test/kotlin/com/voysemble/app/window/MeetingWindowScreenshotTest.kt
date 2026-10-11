// Copyright 2026- At Day. All rights reserved.
// Visual evidence for the meeting window (atlas #7): schematic zone, states, opt-in switch.

package com.voysemble.app.window

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import com.voysemble.app.ui.VoysembleTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

private const val OUT = "../../docs/captures/android"

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w412dp-h915dp-normal-long-notround-any-420dpi-keyshidden-nonav")
class MeetingWindowScreenshotTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun window_open_not_sharing_light() {
        val vm = MeetingWindowViewModel()
        compose.setContent { VoysembleTheme(darkTheme = false) { MeetingWindowRoute(vm, onBack = {}) } }
        compose.onNodeWithText("Open · 28 min left").assertExists()
        compose.onNodeWithText("Inside 5").assertExists()
        compose.onRoot().captureRoboImage("$OUT/window-open.png")
    }

    @Test
    fun window_opted_in_dark() {
        val vm = MeetingWindowViewModel()
        compose.setContent { VoysembleTheme(darkTheme = true) { MeetingWindowRoute(vm, onBack = {}) } }
        compose.onNodeWithContentDescription("Share my position").performClick()
        compose.onNodeWithText("Sharing with leaders until 11:20. Stops automatically.").assertExists()
        compose.onNodeWithText("Uncertain 2").assertExists()
        compose.onRoot().captureRoboImage("$OUT/window-sharing-dark.png")
    }
}
