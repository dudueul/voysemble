// Copyright 2026- At Day. All rights reserved.
// Visual evidence for the bulletin (atlas #9): required ack first, machine translation labelled,
// "Got it" queues offline.

package com.voysemble.app.bulletin

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import com.voysemble.app.ui.VoysembleTheme
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

private const val OUT = "../../docs/captures/android"

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w412dp-h915dp-normal-long-notround-any-420dpi-keyshidden-nonav")
class BulletinScreenshotTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun bulletin_light() {
        compose.setContent { VoysembleTheme(darkTheme = false) { BulletinRoute(BulletinViewModel()) } }
        compose.onNodeWithText("1 update needs your acknowledgment").assertExists()
        // Two of the three announcements carry a translation.
        compose.onAllNodesWithText("Machine translation · 한국어").assertCountEquals(2)
        compose.onRoot().captureRoboImage("$OUT/bulletin-light.png")
    }

    @Test
    fun bulletin_offline_queued_ack() {
        val vm = BulletinViewModel(KoreaConcertTourFixture.announcements().copy(offline = true))
        compose.setContent { VoysembleTheme(darkTheme = false) { BulletinRoute(vm) } }
        compose.onNodeWithText("Got it").performClick()
        compose.onNodeWithText("Queued · sends when online").assertExists()
        compose.onNodeWithText("Nothing waiting for you").assertExists()
        compose.onRoot().captureRoboImage("$OUT/bulletin-offline-queued.png")
    }
}
