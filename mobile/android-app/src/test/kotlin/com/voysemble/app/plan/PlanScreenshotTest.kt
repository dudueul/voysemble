// Copyright 2026- At Day. All rights reserved.
// Visual evidence for the Plan tab (slice 035): the fixture plan on its concert day with the
// leader's affordances, and the proposal form for a new event.

package com.voysemble.app.plan

import com.voysemble.core.i18n.AppLocale
import org.junit.After
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
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
        // Switching days is immediate and local.
        compose.onNodeWithContentDescription("Open Arrival, Monday, Dec 28").performClick()
        compose.onNodeWithText("Flight to Rome").assertExists()
    }

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
