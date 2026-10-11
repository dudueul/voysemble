// Copyright 2026- At Day. All rights reserved.
// Visual evidence for the leader head count (atlas #15). Records PNGs under docs/captures/android/.

package com.voysemble.app.headcount

import androidx.compose.ui.test.junit4.createComposeRule
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
class HeadcountScreenshotTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun headcount_open_two_missing_light() {
        val vm = HeadcountViewModel(deviceClock = { "06:58" })
        compose.setContent { VoysembleTheme(darkTheme = false) { HeadcountRoute(vm, onBack = {}) } }
        compose.onNodeWithText("18 / 20").assertExists()
        compose.onNodeWithText("2 MISSING").assertExists()
        compose.onRoot().captureRoboImage("$OUT/headcount-open.png")
    }

    @Test
    fun headcount_closed_with_missing_pending_sync_dark() {
        val vm = HeadcountViewModel(deviceClock = { "06:58" })
        compose.setContent { VoysembleTheme(darkTheme = true) { HeadcountRoute(vm, onBack = {}) } }
        compose.onNodeWithText("Close head count").performClick()
        compose.onNodeWithText("Pending sync").assertExists()
        compose.onNodeWithText("Closed with 2 missing · incident opened").assertExists()
        compose.onRoot().captureRoboImage("$OUT/headcount-closed-dark.png")
    }
}
