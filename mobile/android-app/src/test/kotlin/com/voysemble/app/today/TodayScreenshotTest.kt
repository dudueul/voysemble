// Copyright 2026- At Day. All rights reserved.
//
// Visual evidence for the mobile Today screen (doc 01 §18.4). Runs on the JVM with Robolectric
// (native graphics) and Roborazzi; records PNGs under docs/captures/android/ when invoked as
// `./gradlew :android-app:recordRoborazziDebug`. 412x915 logical px (doc 01 §18.3).

package com.voysemble.app.today

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
class TodayScreenshotTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun today_light() {
        compose.setContent {
            VoysembleTheme(darkTheme = false) {
                TodayScreen(state = TodayUiState(KoreaConcertTourFixture.today()), onAcknowledge = {}, onSelectTab = {})
            }
        }
        compose.onNodeWithText("Acknowledge").assertExists()
        compose.onRoot().captureRoboImage("$OUT/today-light.png")
    }

    @Test
    fun today_dark() {
        compose.setContent {
            VoysembleTheme(darkTheme = true) {
                TodayScreen(state = TodayUiState(KoreaConcertTourFixture.today()), onAcknowledge = {}, onSelectTab = {})
            }
        }
        compose.onRoot().captureRoboImage("$OUT/today-dark.png")
    }

    @Test
    fun today_guardian() {
        compose.setContent {
            VoysembleTheme(darkTheme = false) {
                TodayScreen(
                    state = TodayUiState(KoreaConcertTourFixture.today(), live = true, guardian = KoreaConcertTourFixture.guardianCard()),
                    onAcknowledge = {},
                    onSelectTab = {},
                )
            }
        }
        compose.onNodeWithText("Counted present").assertExists()
        compose.onNodeWithText("Bus A · 06:52 · by Kim Daeun").assertExists()
        compose.onAllNodesWithText("Open head count").assertCountEquals(0)
        compose.onRoot().captureRoboImage("$OUT/today-guardian.png")
    }

    @Test
    fun today_offline_pending_ack() {
        val vm = TodayViewModel(KoreaConcertTourFixture.today().copy(offline = true, minutesSinceSync = 128))
        compose.setContent { VoysembleTheme(darkTheme = false) { TodayRoute(vm) } }
        compose.onNodeWithText("Acknowledge").performClick()
        compose.onNodeWithText("Queued · sends when online").assertExists()
        compose.onRoot().captureRoboImage("$OUT/today-offline-pending.png")
    }
}
