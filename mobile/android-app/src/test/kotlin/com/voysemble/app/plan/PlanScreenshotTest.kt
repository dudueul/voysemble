// Copyright 2026- At Day. All rights reserved.
// Visual evidence for the Plan tab (slice 035): the fixture plan on its concert day with the
// leader's affordances, and the proposal form for a new event. Slice 047 (D37): the day's
// bookings under the events (the hotel night on the concert day; the flight and the check-in
// on the arrival day, captured as plan-arrival.png).

package com.voysemble.app.plan

import com.voysemble.core.i18n.AppLocale
import org.junit.After
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import com.voysemble.app.today.ProposalTarget
import com.voysemble.app.today.ProposeChangeForm
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
class PlanScreenshotTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun plan_day_light() {
        val vm = PlanViewModel()
        compose.setContent { VoysembleTheme(darkTheme = false) { PlanRoute(vm) } }
        compose.onNodeWithText("Concert day").assertExists()
        compose.onNodeWithText("Colosseum guided tour").assertExists()
        compose.onNodeWithText("Propose an event").assertExists()
        compose.onRoot().captureRoboImage("$OUT/plan-day.png")
        // The bookings of the day (slice 047) sit under the events; the list composes only what
        // shows (CI run 38271876572), so scroll to each row first. Section labels render uppercase.
        compose.day().performScrollToNode(hasText("BOOKINGS"))
        compose.onNodeWithText("BOOKINGS").assertExists()
        compose.day().performScrollToNode(hasText("Night 4 of 5 · Rome · 21 rooms"))
        compose.onNodeWithText("Night 4 of 5 · Rome · 21 rooms").assertExists()
        compose.day().performScrollToNode(hasText("Roma Coach · 20 of 45 seats · Groups: Bus A"))
        compose.onNodeWithText("Roma Coach · 20 of 45 seats · Groups: Bus A").assertExists()
        // Switching days is immediate and local; the arrival day has the flight and the check-in.
        compose.day().performScrollToNode(hasText("Concert day"))
        compose.onNodeWithContentDescription("Open Arrival, Monday, Dec 28").performClick()
        compose.onNodeWithText("Flight to Rome").assertExists()
        compose.day().performScrollToNode(hasText("Check-in today · 5 nights · Rome · 21 rooms"))
        compose.onNodeWithText("ICN → FCO").assertExists()
        compose.onNodeWithText("Check-in today · 5 nights · Rome · 21 rooms").assertExists()
        compose.onRoot().captureRoboImage("$OUT/plan-arrival.png")
    }

    /** The day's lazy list: the first scrollable node (the day chips row sits inside it). */
    private fun ComposeContentTestRule.day() = onAllNodes(hasScrollAction()).onFirst()

    @After
    fun resetLanguage() {
        AppLocale.current = "en"
    }

    @Test
    fun plan_day_ko() {
        // Slice 039: the Plan tab in Korean (labels and events come from the fixture as they are).
        AppLocale.current = "ko"
        val vm = PlanViewModel()
        compose.setContent { VoysembleTheme(darkTheme = false) { PlanRoute(vm) } }
        compose.onNodeWithText("D4 · Concert day").assertExists()
        compose.onNodeWithText("일정 제안").assertExists()
        compose.onNodeWithText("Colosseum guided tour").assertExists()
        compose.onRoot().captureRoboImage("$OUT/plan-day-ko.png")
    }

    @Test
    fun plan_propose_event_form_dark() {
        val day = KoreaConcertTourFixture.plan().days.last()
        compose.setContent {
            VoysembleTheme(darkTheme = true) {
                ProposeChangeForm(ProposalTarget.forDay(day), onSend = {}, onCancel = {}, modifier = Modifier.padding(20.dp))
            }
        }
        compose.onNodeWithText("Propose an event").assertExists()
        compose.onNodeWithText("Title").performTextInput("Gelato on the way back")
        compose.onNodeWithText("Start (HH:mm)").performTextInput("16:15")
        compose.onNodeWithText("Why").performTextInput("The group asked; it is on the walk.")
        compose.onRoot().captureRoboImage("$OUT/plan-propose-dark.png")
    }
}
