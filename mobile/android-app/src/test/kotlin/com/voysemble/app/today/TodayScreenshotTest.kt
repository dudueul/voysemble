// Copyright 2026- At Day. All rights reserved.
//
// Visual evidence for the mobile Today screen (doc 01 §18.4). Runs on the JVM with Robolectric
// (native graphics) and Roborazzi; records PNGs under docs/captures/android/ when invoked as
// `./gradlew :android-app:recordRoborazziDebug`. 412x915 logical px (doc 01 §18.3).

package com.voysemble.app.today

import com.voysemble.core.i18n.AppLocale
import org.junit.After
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import com.voysemble.app.ui.VoysembleTheme
import com.voysemble.core.api.CareNoteStatusDto
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
                TodayScreen(state = TodayUiState(KoreaConcertTourFixture.today(), canPropose = true), onAcknowledge = {}, onSelectTab = {})
            }
        }
        compose.onNodeWithText("Acknowledge").assertExists()
        compose.onRoot().captureRoboImage("$OUT/today-light.png")
    }

    @Test
    fun today_dark() {
        compose.setContent {
            VoysembleTheme(darkTheme = true) {
                TodayScreen(state = TodayUiState(KoreaConcertTourFixture.today(), canPropose = true), onAcknowledge = {}, onSelectTab = {})
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
                    // Slice 048: the guardian's packing card for their traveler.
                    packingSummary = "6 of 9 packed",
                )
            }
        }
        compose.onNodeWithText("Counted present").assertExists()
        compose.onNodeWithText("Bus A · 06:52 · by Kim Daeun").assertExists()
        compose.onNodeWithText("Balance ₩1,200,000 · due 2026-11-30").assertExists()
        compose.onAllNodesWithText("Open head count").assertCountEquals(0)
        compose.onRoot().captureRoboImage("$OUT/today-guardian.png")
        // Slice 048: the packing card sits under the guardian cards; the list composes only what shows.
        compose.onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasText("Open packing list"))
        compose.onNodeWithText("Packing list").assertExists()
        compose.onNodeWithText("6 of 9 packed").assertExists()
    }

    @Test
    fun today_guardian_editing_care_note() {
        // Slice 032 (D27): the guardian's care-note card in edit mode, prefilled from a reveal.
        val care = GuardianCareState(
            travelerId = "t1",
            status = CareNoteStatusDto("t1", hasCareNote = true, updatedAt = "2026-12-30T10:00:00.000Z", updatedByName = "Sora Park", reveals = 2),
            draft = KoreaConcertTourFixture.careNote(),
        )
        compose.setContent {
            VoysembleTheme(darkTheme = false) {
                TodayScreen(
                    state = TodayUiState(KoreaConcertTourFixture.today(), live = true, guardian = KoreaConcertTourFixture.guardianCard(), care = care),
                    onAcknowledge = {},
                    onSelectTab = {},
                )
            }
        }
        compose.onNodeWithText("On file · 2 reveals").assertExists()
        compose.onNodeWithText("Save care note").assertExists()
        compose.onRoot().captureRoboImage("$OUT/today-guardian-care.png")
    }

    @After
    fun resetLanguage() {
        AppLocale.current = "en"
    }

    @Test
    fun today_ko() {
        // Slice 039: the same screen in Korean; the fixture's own names stay as they are.
        AppLocale.current = "ko"
        compose.setContent {
            VoysembleTheme(darkTheme = false) {
                TodayScreen(state = TodayUiState(KoreaConcertTourFixture.today(), canPropose = true), onAcknowledge = {}, onSelectTab = {})
            }
        }
        compose.onNodeWithText("다음 일정").assertExists()
        compose.onNodeWithText("확인했어요").assertExists()
        compose.onNodeWithText("변경 제안").assertExists()
        compose.onRoot().captureRoboImage("$OUT/today-ko.png")
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
