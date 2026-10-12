// Copyright 2026- At Day. All rights reserved.
// Visual evidence for the packing checklist (D38, slice 048): a traveler's list with six of nine
// packed, a tap that ticks the adapter, and a guardian's list for their traveler in the dark theme.

package com.voysemble.app.packing

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
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
class PackingScreenshotTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun packing_light() {
        val vm = PackingViewModel()
        compose.setContent { VoysembleTheme(darkTheme = false) { PackingRoute(vm, onBack = {}) } }
        compose.onNodeWithText("Your packing list").assertExists()
        compose.onNodeWithText("6 of 9 packed").assertExists()
        compose.onNodeWithText("EU plug adapter").assertExists()
        compose.onNodeWithText("Type C or F").assertExists()
        compose.onRoot().captureRoboImage("$OUT/packing-light.png")
        // A tap ticks the item at once (sample mode: no network).
        compose.onNodeWithContentDescription("EU plug adapter, not packed yet").performClick()
        compose.onNodeWithText("7 of 9 packed").assertExists()
        compose.onNodeWithContentDescription("EU plug adapter, packed").assertExists()
    }

    @Test
    fun packing_guardian_dark() {
        val mine = KoreaConcertTourFixture.packing()
        val vm = PackingViewModel(initial = mine.copy(travelerName = "Minji Park", forTraveler = true))
        compose.setContent { VoysembleTheme(darkTheme = true) { PackingRoute(vm, onBack = {}) } }
        compose.onNodeWithText("Packing for Minji Park").assertExists()
        compose.onNodeWithText("6 of 9 packed").assertExists()
        compose.onRoot().captureRoboImage("$OUT/packing-guardian-dark.png")
    }
}
