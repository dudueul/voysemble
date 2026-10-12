// Copyright 2026- At Day. All rights reserved.
// Visual evidence for the rooming list (D41, slice 059): the fixture hotel's rooms with the
// leader in bold and one person without a room, light and dark.

package com.voysemble.app.plan

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
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
class RoomingScreenshotTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun rooming_light() {
        val vm = RoomingViewModel()
        compose.setContent { VoysembleTheme(darkTheme = false) { RoomingRoute(vm, onBack = {}) } }
        compose.onNodeWithText("Hotel de la Ville").assertExists()
        compose.onNodeWithText("4 of 5 placed · 3 of 21 rooms used").assertExists()
        compose.onNodeWithText("Room 412").assertExists()
        compose.onNodeWithText("Minji Park").assertExists()
        compose.onNodeWithContentDescription("Lee Hana, no room yet").assertExists()
        compose.onRoot().captureRoboImage("$OUT/rooming-light.png")
    }

    @Test
    fun rooming_dark() {
        val vm = RoomingViewModel()
        compose.setContent { VoysembleTheme(darkTheme = true) { RoomingRoute(vm, onBack = {}) } }
        compose.onNodeWithText("Room 501").assertExists()
        compose.onRoot().captureRoboImage("$OUT/rooming-dark.png")
    }
}
