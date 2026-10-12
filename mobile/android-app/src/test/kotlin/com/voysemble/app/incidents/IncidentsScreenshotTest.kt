// Copyright 2026- At Day. All rights reserved.
// Visual evidence for the leader incident cards (D17). Records PNGs under docs/captures/android/.

package com.voysemble.app.incidents

import com.voysemble.core.incidents.IncidentFeed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.assertCountEquals
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
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performTextInput
import com.voysemble.core.fixtures.KoreaConcertTourFixture

private const val OUT = "../../docs/captures/android"

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w412dp-h915dp-normal-long-notround-any-420dpi-keyshidden-nonav")
class IncidentsScreenshotTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun incidents_open_and_resolved_light() {
        val vm = IncidentsViewModel(deviceClock = { "07:12" })
        compose.setContent { VoysembleTheme(darkTheme = false) { IncidentsRoute(vm, onBack = {}) } }
        compose.onNodeWithText("1 open").assertExists()
        compose.onNodeWithText("Not confirmed yet").assertExists()
        compose.onNodeWithText("Guardian message sent").assertExists()
        compose.onRoot().captureRoboImage("$OUT/incidents-open.png")
    }

    @Test
    fun incidents_help_card() {
        // Slice 079: a traveler's own request leads the list with its "Asked for help" chip; the others say where they came from.
        val feed = IncidentFeed(listOf(KoreaConcertTourFixture.helpIncident()) + KoreaConcertTourFixture.incidents().cards, offline = false)
        compose.setContent {
            VoysembleTheme(darkTheme = false) {
                IncidentsScreen(state = IncidentsUiState(feed, live = false), onConfirm = { _, _ -> }, onBack = {})
            }
        }
        compose.onNodeWithText("Asked for help").assertExists()
        compose.onNodeWithText("Head count").assertExists()
        compose.onNodeWithText("By hand").assertExists()
        compose.onNodeWithText("I feel sick").assertExists()
        compose.onRoot().captureRoboImage("$OUT/incidents-help.png")
    }

    @Test
    fun incidents_new_card_form() {
        // Slice 073: the form a leader fills to open a card by hand, with Bus A's travelers.
        compose.setContent {
            VoysembleTheme(darkTheme = false) {
                NewIncidentForm(travelers = KoreaConcertTourFixture.rosterForIncidents(), error = null, onOpen = { _, _ -> })
            }
        }
        compose.onNodeWithContentDescription("What happened").performTextInput("Lost passport at the hotel desk")
        compose.onNodeWithContentDescription("Include Minji Park").performClick()
        compose.onNodeWithText("Open incident").assertExists()
        compose.onRoot().captureRoboImage("$OUT/incidents-new.png")
    }

    @Test
    fun incidents_answer_pending_dark() {
        val vm = IncidentsViewModel(deviceClock = { "07:12" })
        compose.setContent { VoysembleTheme(darkTheme = true) { IncidentsRoute(vm, onBack = {}) } }
        compose.onNodeWithText("With group").performClick()
        compose.onAllNodesWithText("With the group").assertCountEquals(2)
        compose.onNodeWithText("Pending sync").assertExists()
        compose.onRoot().captureRoboImage("$OUT/incidents-pending-dark.png")
    }
}
