// Copyright 2026- At Day. All rights reserved.
//
// Visual evidence for the mobile Today screen (doc 01 §18.4). Runs on the JVM with Robolectric
// (native graphics) and Roborazzi; records PNGs under docs/captures/android/ when invoked as
// `./gradlew :android-app:recordRoborazziDebug`. 412x915 logical px (doc 01 §18.3).

package com.voysemble.app.today

import com.voysemble.core.today.HelpStatus
import com.voysemble.core.today.HelpCard
import com.voysemble.core.i18n.AppLocale
import org.junit.After
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.onNodeWithContentDescription
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
import com.voysemble.core.session.ActiveTrip
import com.voysemble.core.session.TripChoice

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
                // Slice 053 (D29): the header's bell carries the inbox's unread count.
                TodayScreen(state = TodayUiState(KoreaConcertTourFixture.today(), canPropose = true, room = KoreaConcertTourFixture.myRoom()), onAcknowledge = {}, onSelectTab = {}, inboxUnread = 2)
            }
        }
        compose.onNodeWithText("Acknowledge").assertExists()
        compose.onNodeWithContentDescription("Inbox, 2 unread").assertExists()
        compose.onRoot().captureRoboImage("$OUT/today-light.png")
    }

    @Test
    fun today_trip_switch() {
        // Slice 067 (D42): the account's trips as the sheet lists them, the current one marked.
        val kim = ActiveTrip("org1", "Seoul Arts High", "trip1", "Korea Concert Tour", "p1", "leader")
        val winter = TripChoice(kim, "2026-12-26", "2027-01-07", "Asia/Seoul", "Kim Daeun", "Bus A")
        val spring = TripChoice(ActiveTrip("org1", "Seoul Arts High", "trip2", "Spring Choir Exchange", "p2", "leader"), "2027-03-20", "2027-03-27", "Europe/Rome", "Kim Daeun", null)
        compose.setContent { VoysembleTheme(darkTheme = false) { TripChoiceList(listOf(winter, spring), null, "trip1") {} } }
        compose.onNodeWithText("Spring Choir Exchange").assertExists()
        compose.onNodeWithText("Seoul Arts High · Leader · Bus A").assertExists()
        compose.onNodeWithContentDescription("Switch to Spring Choir Exchange").assertExists()
        compose.onNodeWithContentDescription("Korea Concert Tour · Current").assertExists()
        compose.onRoot().captureRoboImage("$OUT/today-trip-switch.png")
    }

    @Test
    fun today_help_card_and_form() {
        // Slice 074 (D17): the traveler's "I need help" card with a request on its way, then the form.
        val sent = HelpCard("local-help", "I feel sick", HelpStatus.OPEN, "07:12", null)
        compose.setContent {
            VoysembleTheme(darkTheme = false) {
                TodayScreen(state = TodayUiState(KoreaConcertTourFixture.today(), canAskHelp = true, help = sent), onAcknowledge = {}, onSelectTab = {})
            }
        }
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("NEED HELP?"))
        compose.onNodeWithText("I feel sick").assertExists()
        compose.onNodeWithText("Your leaders and the organizer know · 07:12").assertExists()
        compose.onRoot().captureRoboImage("$OUT/today-help.png")
    }

    @Test
    fun today_guardian_asked_for_help() {
        // Slice 080 (D13): the guardian's card while Minji's own request is open, before any message.
        compose.setContent {
            VoysembleTheme(darkTheme = false) {
                TodayScreen(
                    state = TodayUiState(KoreaConcertTourFixture.today(), live = true, guardian = KoreaConcertTourFixture.guardianCardAskedForHelp()),
                    onAcknowledge = {},
                    onSelectTab = {},
                    packingSummary = "6 of 9 packed",
                )
            }
        }
        compose.onNodeWithText("Asked for help at 07:05").assertExists()
        compose.onNodeWithText("The leaders and the organizer are on it. You will get a confirmed update here.").assertExists()
        compose.onRoot().captureRoboImage("$OUT/today-guardian-help.png")
    }

    @Test
    fun today_room() {
        // Slice 075 (D41): Minji's room tonight under the head count card, scrolled into view.
        compose.setContent {
            VoysembleTheme(darkTheme = false) {
                TodayScreen(state = TodayUiState(KoreaConcertTourFixture.today(), canPropose = true, room = KoreaConcertTourFixture.myRoom()), onAcknowledge = {}, onSelectTab = {})
            }
        }
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("YOUR ROOM TONIGHT"))
        compose.onNodeWithText("Room 412 · Hotel de la Ville").assertExists()
        compose.onNodeWithText("with Juho Kim").assertExists()
        compose.onRoot().captureRoboImage("$OUT/today-room.png")
    }

    @Test
    fun today_help_form() {
        compose.setContent { VoysembleTheme(darkTheme = false) { HelpForm(onSend = {}) } }
        compose.onNodeWithContentDescription("What's wrong (optional)").assertExists()
        compose.onNodeWithText("Send").assertExists()
        compose.onRoot().captureRoboImage("$OUT/today-help-form.png")
    }

    @Test
    fun today_dark() {
        compose.setContent {
            VoysembleTheme(darkTheme = true) {
                TodayScreen(state = TodayUiState(KoreaConcertTourFixture.today(), canPropose = true, room = KoreaConcertTourFixture.myRoom()), onAcknowledge = {}, onSelectTab = {})
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
                TodayScreen(state = TodayUiState(KoreaConcertTourFixture.today(), canPropose = true, room = KoreaConcertTourFixture.myRoom()), onAcknowledge = {}, onSelectTab = {})
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
