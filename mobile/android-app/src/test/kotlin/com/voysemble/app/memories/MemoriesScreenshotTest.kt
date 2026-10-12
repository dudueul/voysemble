// Copyright 2026- At Day. All rights reserved.
// Visual evidence for the Memories tab (D18, slice 044): the leader's view of the fixture (the
// review queue, the pool with album chips and the add button) and a guardian's album-only view.

package com.voysemble.app.memories

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
class MemoriesScreenshotTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun memories_leader_light() {
        val vm = MemoriesViewModel()
        compose.setContent { VoysembleTheme(darkTheme = false) { MemoriesRoute(vm) } }
        compose.onNodeWithText("5 in the pool · 2 in the album · 1 to review").assertExists()
        compose.onNodeWithText("Possible nudity").assertExists()
        compose.onNodeWithText("Add photos").assertExists()
        compose.onNodeWithContentDescription("Photo by Juho Kim, Day 4").assertExists()
        compose.onRoot().captureRoboImage("$OUT/memories-light.png")
    }

    @Test
    fun memories_guardian_dark() {
        val vm = MemoriesViewModel(sampleRole = "guardian")
        compose.setContent { VoysembleTheme(darkTheme = true) { MemoriesRoute(vm) } }
        compose.onNodeWithText("2 approved photos of your traveler").assertExists()
        // Section labels render uppercase (Widgets.SectionLabel).
        compose.onNodeWithText("GUARDIAN ALBUM").assertExists()
        compose.onNodeWithText("Approved photos tagged with your traveler or the whole group.").assertExists()
        compose.onNodeWithText("Add photos").assertDoesNotExist()
        compose.onRoot().captureRoboImage("$OUT/memories-guardian-dark.png")
    }
}
